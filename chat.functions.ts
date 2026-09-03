import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ThreadId = z.object({ threadId: z.string().uuid() });
const CreateThread = z.object({ title: z.string().max(120).optional() }).default({});
const RenameThread = z.object({ threadId: z.string().uuid(), title: z.string().min(1).max(120) });
const DeleteThread = z.object({ threadId: z.string().uuid() });

const EmptyInput = z.object({}).default({});

/** List the signed-in user's chat threads, newest first. */
export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("threads")
      .select("id, title, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Create a new thread and return its id. */
export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => CreateThread.parse(input))
  .handler(async ({ data, context }) => {
    const { data: thread, error } = await context.supabase
      .from("threads")
      .insert({ user_id: context.userId, title: data.title ?? "New chat" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return thread.id;
  });

/** Rename a thread. */
export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => RenameThread.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .update({ title: data.title, updated_at: new Date().toISOString() })
      .eq("id", data.threadId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Delete a thread and all its messages. */
export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DeleteThread.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .delete()
      .eq("id", data.threadId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/** Delete all chat threads (and their messages) owned by the current user. */
export const clearAllThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("threads").delete().eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Load messages for a thread. */
export const loadMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ThreadId.parse(input))
  .handler(async ({ data, context }) => {
    const { data: thread } = await context.supabase
      .from("threads")
      .select("id")
      .eq("id", data.threadId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!thread) throw new Error("Thread not found");

    const { data: messages, error } = await context.supabase
      .from("messages")
      .select("id, role, content, kind, image_url, reasoning, created_at")
      .eq("thread_id", data.threadId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return messages ?? [];
  });
