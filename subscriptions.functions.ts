import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SubmitPayment = z.object({
  plan: z.enum(["monthly", "yearly"]),
  amount: z.number().int().positive(),
  method: z.enum(["easypaisa", "jazzcash"]),
  senderNumber: z.string().max(20).optional(),
  screenshotPath: z.string().min(1),
});

/** Get the current user's Pro subscription status and usage limits. */
export const getSubscriptionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: sub, error } = await context.supabase
      .from("subscriptions")
      .select("plan, status, expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const isPro = sub?.status === "active" && sub.expires_at && new Date(sub.expires_at).getTime() > Date.now();

    const { data: lastSubmission } = await context.supabase
      .from("payment_submissions")
      .select("status, review_note, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      isPro: Boolean(isPro),
      plan: sub?.plan ?? null,
      expiresAt: sub?.expires_at ?? null,
      lastSubmission: lastSubmission ?? null,
    };
  });

/** Submit a manual payment request with screenshot path. */
export const submitPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SubmitPayment.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("payment_submissions").insert({
      user_id: context.userId,
      plan: data.plan,
      amount: data.amount,
      method: data.method,
      sender_number: data.senderNumber ?? null,
      screenshot_path: data.screenshotPath,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
