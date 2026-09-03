import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getSubscriptionStatus, submitPayment } from "@/lib/subscriptions.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Crown, Upload, MessageSquareText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Pricing — Sindhi AI" },
      { name: "description", content: "Upgrade to Sindhi AI Pro for unlimited messages and images." },
      { property: "og:title", content: "Pricing — Sindhi AI" },
      { property: "og:description", content: "Upgrade to Sindhi AI Pro for unlimited messages and images." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

export default function PricingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const getSub = useServerFn(getSubscriptionStatus);
  const submit = useServerFn(submitPayment);

  const subQuery = useQuery({
    queryKey: ["subscription"],
    queryFn: getSub,
    enabled: !!user,
  });

  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");
  const [method, setMethod] = useState<"easypaisa" | "jazzcash">("easypaisa");
  const [senderNumber, setSenderNumber] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isPro = subQuery.data?.isPro ?? false;
  const amount = plan === "monthly" ? 300 : 800;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in first.");
      return;
    }
    if (!screenshot) {
      toast.error("Please upload the payment screenshot.");
      return;
    }

    setSubmitting(true);
    try {
      const path = `${user.id}/${crypto.randomUUID()}.${screenshot.name.split(".").pop() ?? "png"}`;
      const { error: uploadError } = await supabase.storage
        .from("payment-screenshots")
        .upload(path, screenshot);
      if (uploadError) throw new Error(uploadError.message);

      await submit({
        plan,
        amount,
        method,
        senderNumber: senderNumber.trim() || undefined,
        screenshotPath: path,
      });

      toast.success("Payment submitted! It will be reviewed soon.");
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      setScreenshot(null);
      setSenderNumber("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-bold">Sindhi AI</span>
          </Link>
          <Link to="/chat">
            <Button variant="outline">Back to chat</Button>
          </Link>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Upgrade to Pro</h1>
          <p className="mt-2 text-muted-foreground">
            Unlimited messages, unlimited images, and deep thinking.
          </p>
        </div>

        {isPro && (
          <Card className="mb-8 border-primary/50 bg-primary/5">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-8">
              <Crown className="h-8 w-8 text-primary" />
              <p className="text-lg font-semibold text-foreground">
                You are already on Pro ({subQuery.data?.plan})
              </p>
              {subQuery.data?.expiresAt && (
                <p className="text-sm text-muted-foreground">
                  Expires on {new Date(subQuery.data.expiresAt).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Monthly
                <Badge variant="secondary">Rs 300</Badge>
              </CardTitle>
              <CardDescription>Flexible, renew every month.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {["Unlimited messages", "Unlimited images", "Deep thinking"].map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-primary" /> {f}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Yearly
                <Badge variant="default">Rs 800</Badge>
              </CardTitle>
              <CardDescription>Best value — save Rs 2,800.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {["Unlimited messages", "Unlimited images", "Deep thinking", "Priority support"].map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-primary" /> {f}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Submit payment</CardTitle>
            <CardDescription>
              Pay manually via Easypaisa or JazzCash, then upload the screenshot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label>Choose plan</Label>
                <RadioGroup
                  value={plan}
                  onValueChange={(v) => setPlan(v as "monthly" | "yearly")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="monthly" id="monthly" />
                    <Label htmlFor="monthly">Monthly — Rs 300</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yearly" id="yearly" />
                    <Label htmlFor="yearly">Yearly — Rs 800</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="rounded-xl border border-border bg-muted/50 p-4">
                <p className="font-medium text-foreground">Send Rs {amount} to:</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-card p-3">
                    <p className="text-xs text-muted-foreground">Easypaisa</p>
                    <p className="font-medium">Sikander Ali</p>
                    <p className="text-sm">0349-3818917</p>
                  </div>
                  <div className="rounded-lg bg-card p-3">
                    <p className="text-xs text-muted-foreground">JazzCash</p>
                    <p className="font-medium">Sikander Ali</p>
                    <p className="text-sm">0307-3896980</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Payment method used</Label>
                <RadioGroup
                  value={method}
                  onValueChange={(v) => setMethod(v as "easypaisa" | "jazzcash")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="easypaisa" id="easypaisa" />
                    <Label htmlFor="easypaisa">Easypaisa</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="jazzcash" id="jazzcash" />
                    <Label htmlFor="jazzcash">JazzCash</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sender">Sender number (optional)</Label>
                <Input
                  id="sender"
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                  placeholder="03XX-XXXXXXX"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="screenshot">Payment screenshot</Label>
                <Input
                  id="screenshot"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                />
                {screenshot && (
                  <p className="text-xs text-muted-foreground">Selected: {screenshot.name}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={submitting || isPro}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit payment"}
              </Button>

              {subQuery.data?.lastSubmission && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p className="font-medium text-foreground">Last submission</p>
                  <p className="text-muted-foreground">
                    Status: {" "}
                    <span className="capitalize text-foreground">
                      {subQuery.data.lastSubmission.status}
                    </span>
                  </p>
                  {subQuery.data.lastSubmission.review_note && (
                    <p className="text-muted-foreground">
                      Note: {subQuery.data.lastSubmission.review_note}
                    </p>
                  )}
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
