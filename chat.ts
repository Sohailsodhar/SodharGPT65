import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateRequest,
  jsonError,
  isProUser,
  usageToday,
  FREE_MESSAGES_PER_HOUR,
} from "@/lib/api-auth.server";

const SYSTEM_PROMPT = `You are "Sindhi AI" — a warm, knowledgeable assistant built for Sindh and for the whole world.

LANGUAGE RULE (most important):
- Always reply in the SAME language and the SAME script the user wrote in.
- Sindhi (سنڌي) is fully supported and is your pride: if the user writes Sindhi, reply in fluent, natural Sindhi.
- If the user writes Urdu, reply in Urdu. Roman Urdu / Roman Sindhi in, Roman out. English in, English out. Mixed in, mixed out.
- Match the user's tone and "andaaz": casual and friendly if they are casual, formal and respectful if they are formal, short if they are short.
- Never lecture the user about their language choice and never switch languages unless asked.

Be genuinely helpful, accurate and concise. Use markdown when it helps. If you don't know something, say so plainly.`;

type Body = {
  threadId?: string;
  text?: string;
  deepThinking?: boolean;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateRequest(request);
        if (!ctx) return jsonError("Please sign in again.", 401);

        const body = (await request.json()) as Body;
        const text = (body.text ?? "").trim();
        const threadId = body.threadId;
        if (!text || !threadId) return jsonError("Message and chat are required.", 400);

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return jsonError("AI is not configured.", 500);

        const { data: thread } = await ctx.supabase
          .from("threads")
          .select("id, title")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread) return jsonError("Chat not found.", 404);

        const pro = await isProUser(ctx);
        if (!pro) {
          const usage = await usageToday(ctx);
          if (usage.messages >= FREE_MESSAGES_PER_HOUR) {
            return jsonError(
              `Free plan limit reached (${FREE_MESSAGES_PER_HOUR} messages this hour). Upgrade to Pro for unlimited chat.`,
              402,
            );
          }
        }
        const deepThinking = Boolean(body.deepThinking) && pro;

        // Load history before inserting the new turn.
        const { data: history } = await ctx.supabase
          .from("messages")
          .select("role, content, kind")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true })
          .limit(40);

        const { data: inserted, error: insertError } = await ctx.supabase
          .from("messages")
          .insert({ thread_id: threadId, user_id: ctx.userId, role: "user", content: text })
          .select("id")
          .single();
        if (insertError) return jsonError(insertError.message, 500);

        const input = [
          ...(history ?? [])
            .filter((m) => m.content && m.content.trim().length > 0)
            .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
          { role: "user", content: text },
        ];

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "fetch",
          },
          body: JSON.stringify({
            model: "openai/gpt-5.6-sol",
            instructions: SYSTEM_PROMPT,
            input,
            stream: true,
            store: false,
            ...(deepThinking
              ? {
                  reasoning: { effort: "medium", summary: "auto" },
                  include: ["reasoning.encrypted_content"],
                }
              : {}),
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          console.error("gateway error", upstream.status, detail);
          return jsonError(
            upstream.status === 402
              ? "AI credits are exhausted. Please contact the app owner."
              : "The AI service returned an error. Please try again.",
            upstream.status === 429 || upstream.status >= 500 ? 503 : upstream.status,
          );
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const supabase = ctx.supabase;
        const userId = ctx.userId;
        const isFirstTurn = (history ?? []).length === 0;

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (payload: unknown) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

            let answer = "";
            let reasoning = "";
            let buffer = "";
            const reader = upstream.body!.getReader();

            try {
              send({ type: "start", userMessageId: inserted.id });
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";
                for (const part of parts) {
                  for (const line of part.split("\n")) {
                    if (!line.startsWith("data:")) continue;
                    const raw = line.slice(5).trim();
                    if (!raw || raw === "[DONE]") continue;
                    let evt: { type?: string; delta?: string };
                    try {
                      evt = JSON.parse(raw);
                    } catch {
                      continue;
                    }
                    if (evt.type === "response.output_text.delta" && evt.delta) {
                      answer += evt.delta;
                      send({ type: "text", delta: evt.delta });
                    } else if (
                      evt.type === "response.reasoning_summary_text.delta" &&
                      evt.delta
                    ) {
                      reasoning += evt.delta;
                      send({ type: "reasoning", delta: evt.delta });
                    }
                  }
                }
              }

              const finalText =
                answer.trim().length > 0
                  ? answer
                  : reasoning.trim().length > 0
                    ? reasoning
                    : "Sorry, I couldn't produce a reply. Please try again.";

              const { error: saveError } = await supabase.from("messages").insert({
                thread_id: threadId,
                user_id: userId,
                role: "assistant",
                content: finalText,
                reasoning: reasoning || null,
              });
              if (saveError) console.error("save assistant message failed", saveError);

              const title = isFirstTurn ? text.slice(0, 60) : null;
              await supabase
                .from("threads")
                .update({
                  updated_at: new Date().toISOString(),
                  ...(title ? { title } : {}),
                })
                .eq("id", threadId);

              send({ type: "done", title });
            } catch (error) {
              console.error("chat stream failed", error);
              send({ type: "error", message: "The reply was interrupted." });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
