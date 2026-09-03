import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ReviewInput = z.object({
  submissionId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
});

/** Admin-only: approve or reject a payment submission and activate Pro on approval. */
export const reviewPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ReviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: submission, error } = await supabaseAdmin
      .from("payment_submissions")
      .select("id, user_id, plan, status")
      .eq("id", data.submissionId)
      .single();
    if (error || !submission) throw new Error("Submission not found");
    if (submission.status !== "pending") throw new Error("This payment was already reviewed");

    const now = new Date();
    if (data.action === "approve") {
      const expires = new Date(now);
      if (submission.plan === "yearly") expires.setFullYear(expires.getFullYear() + 1);
      else expires.setMonth(expires.getMonth() + 1);

      const { error: subError } = await supabaseAdmin.from("subscriptions").upsert({
        user_id: submission.user_id,
        plan: submission.plan,
        status: "active",
        expires_at: expires.toISOString(),
        updated_at: now.toISOString(),
      });
      if (subError) throw new Error(subError.message);
    }

    const { error: updateError } = await supabaseAdmin
      .from("payment_submissions")
      .update({
        status: data.action === "approve" ? "approved" : "rejected",
        review_note: data.note ?? null,
        reviewed_at: now.toISOString(),
      })
      .eq("id", submission.id);
    if (updateError) throw new Error(updateError.message);

    return { ok: true };
  });

/** Grants the admin role to the caller when no admin exists yet (first-run bootstrap). */
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("email").eq("id", context.userId).maybeSingle();
    if (profile?.email?.toLowerCase() !== "itssohailsodhar@gmail.com") return { granted: false as const };

    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    return { granted: true as const };
  });

/** Admin-only: list every payment submission with the submitting user's email. */
export const listSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: submissions, error } = await supabaseAdmin
      .from("payment_submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const userIds = [...new Set((submissions ?? []).map((s) => s.user_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

    const [{ count: users }, { count: proUsers }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("subscriptions")
        .select("user_id", { count: "exact", head: true })
        .eq("status", "active"),
    ]);

    const rows = await Promise.all(
      (submissions ?? []).map(async (s) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("payment-screenshots")
          .createSignedUrl(s.screenshot_path, 60 * 60);
        const profile = (profiles ?? []).find((p) => p.id === s.user_id);
        return {
          id: s.id,
          plan: s.plan,
          amount: s.amount,
          method: s.method,
          senderNumber: s.sender_number,
          status: s.status,
          reviewNote: s.review_note,
          createdAt: s.created_at,
          email: profile?.email ?? "unknown",
          displayName: profile?.display_name ?? "",
          screenshotUrl: signed?.signedUrl ?? null,
        };
      }),
    );

    return {
      submissions: rows,
      stats: {
        users: users ?? 0,
        proUsers: proUsers ?? 0,
        pending: rows.filter((r) => r.status === "pending").length,
      },
    };
  });
