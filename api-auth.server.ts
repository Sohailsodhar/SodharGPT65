import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function makeFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export type AuthedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

/** Verifies the bearer token on an incoming request and returns a user-scoped client. */
export async function authenticateRequest(request: Request): Promise<AuthedContext | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: makeFetch(key),
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase: client, userId: data.user.id };
}

export function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const FREE_MESSAGES_PER_HOUR = 15;
export const FREE_IMAGES_PER_HOUR = 5;

export async function isProUser(ctx: AuthedContext): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("subscriptions")
    .select("status, expires_at")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!data || data.status !== "active") return false;
  if (!data.expires_at) return false;
  return new Date(data.expires_at).getTime() > Date.now();
}

/** Counts usage in the rolling one-hour window for the signed-in user. */
export async function usageToday(ctx: AuthedContext) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [msgs, imgs] = await Promise.all([
    ctx.supabase.from("messages").select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId).eq("role", "user").eq("kind", "text").gte("created_at", since),
    ctx.supabase.from("messages").select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId).eq("role", "assistant").eq("kind", "image").gte("created_at", since),
  ]);

  return { messages: msgs.count ?? 0, images: imgs.count ?? 0, resetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
}
