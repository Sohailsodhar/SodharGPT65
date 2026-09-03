import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateRequest,
  jsonError,
  isProUser,
  usageToday,
  FREE_IMAGES_PER_HOUR,
} from "@/lib/api-auth.server";

type Body = { threadId?: string; prompt?: string };

function extractBase64(json: unknown): string | null {
  const j = json as {
    data?: Array<{ b64_json?: string; url?: string }>;
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };
  const b64 = j?.data?.[0]?.b64_json;
  if (b64) return b64;
  const url = j?.data?.[0]?.url ?? j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (url && url.startsWith("data:")) return url.split(",")[1] ?? null;
  return null;
}

export const Route = createFileRoute("/api/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateRequest(request);
        if (!ctx) return jsonError("Please sign in again.", 401);

        const body = (await request.json()) as Body;
        const prompt = (body.prompt ?? "").trim();
        const threadId = body.threadId;
        if (!prompt || !threadId) return jsonError("Prompt and chat are required.", 400);

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return jsonError("AI is not configured.", 500);

        const { data: thread } = await ctx.supabase
          .from("threads")
          .select("id")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread) return jsonError("Chat not found.", 404);

        const pro = await isProUser(ctx);
        if (!pro) {
          const usage = await usageToday(ctx);
          if (usage.images >= FREE_IMAGES_PER_HOUR) {
            return jsonError(
              `Free plan limit reached (${FREE_IMAGES_PER_HOUR} images this hour). Upgrade to Pro for unlimited images.`,
              402,
            );
          }
        }

        await ctx.supabase.from("messages").insert({
          thread_id: threadId,
          user_id: ctx.userId,
          role: "user",
          content: prompt,
          kind: "image_prompt",
        });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "fetch",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image",
            messages: [{ role: "user", content: prompt }],
            modalities: ["image", "text"],
          }),
        });

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          console.error("image gateway error", upstream.status, detail);
          return jsonError(
            upstream.status === 402
              ? "AI credits are exhausted. Please contact the app owner."
              : "Image generation failed. Please try again.",
            upstream.status === 429 || upstream.status >= 500 ? 503 : upstream.status,
          );
        }

        const b64 = extractBase64(await upstream.json());
        if (!b64) return jsonError("The model did not return an image. Try a different prompt.", 502);

        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const path = `${ctx.userId}/${crypto.randomUUID()}.png`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: uploadError } = await supabaseAdmin.storage
          .from("generated-images")
          .upload(path, bytes, { contentType: "image/png" });
        if (uploadError) {
          console.error("upload failed", uploadError);
          return jsonError("Could not save the generated image.", 500);
        }

        const { error: saveError } = await ctx.supabase.from("messages").insert({
          thread_id: threadId,
          user_id: ctx.userId,
          role: "assistant",
          content: prompt,
          image_url: path,
          kind: "image",
        });
        if (saveError) return jsonError(saveError.message, 500);

        await ctx.supabase
          .from("threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", threadId);

        return new Response(JSON.stringify({ path }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
