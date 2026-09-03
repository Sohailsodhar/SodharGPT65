import { supabase } from "@/integrations/supabase/client";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type StreamEvent =
  | { type: "start"; userMessageId: string }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "done"; title: string | null }
  | { type: "error"; message: string };

export async function streamChat(
  payload: { threadId: string; text: string; deepThinking: boolean },
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? "Chat request failed.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
        if (!raw) continue;
        try {
          onEvent(JSON.parse(raw) as StreamEvent);
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  }
}

export async function generateImage(payload: { threadId: string; prompt: string }) {
  const res = await fetch("/api/image", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => null)) as { path?: string; error?: string } | null;
  if (!res.ok) throw new Error(json?.error ?? "Image generation failed.");
  return json?.path ?? null;
}

export async function signedImageUrl(path: string) {
  const { data } = await supabase.storage.from("generated-images").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
