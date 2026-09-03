import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { listSubmissions, reviewPayment } from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, MessageSquareText, Users, Crown, Clock, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin — Sindhi AI" },
      { name: "description", content: "Admin panel for Sindhi AI payment approvals." },
      { property: "og:title", content: "Admin — Sindhi AI" },
      { property: "og:description", content: "Admin panel for Sindhi AI payment approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

export default function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const list = useServerFn(listSubmissions);
  const review = useServerFn(reviewPayment);

  const query = useQuery({
    queryKey: ["admin", "submissions"],
    queryFn: list,
    enabled: !!user,
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [processing, setProcessing] = useState(false);

  if (!user) return <Navigate to="/auth" />;

  async function handleReview(action: "approve" | "reject") {
    if (!activeId) return;
    setProcessing(true);
    try {
      await review({ submissionId: activeId, action, note: note.trim() || undefined });
      toast.success(action === "approve" ? "Approved and Pro activated." : "Rejected.");
      queryClient.invalidateQueries({ queryKey: ["admin", "submissions"] });
      setActiveId(null);
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review failed.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-bold">Sindhi AI Admin</span>
          </Link>
          <Link to="/chat">
            <Button variant="outline">Back to chat</Button>
          </Link>
        </div>

        {query.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="mb-8 grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{query.data?.stats.users ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pro users</CardTitle>
                  <Crown className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{query.data?.stats.proUsers ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{query.data?.stats.pending ?? 0}</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              {query.data?.submissions.map((s) => (
                <Card key={s.id}>
                  <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{s.email}</span>
                        <Badge
                          variant={
                            s.status === "approved"
                              ? "default"
                              : s.status === "rejected"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {s.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {s.plan === "monthly" ? "Monthly" : "Yearly"} — Rs {s.amount} via{" "}
                        <span className="capitalize">{s.method}</span>
                      </p>
                      {s.senderNumber && (
                        <p className="text-sm text-muted-foreground">From: {s.senderNumber}</p>
                      )}
                      {s.reviewNote && (
                        <p className="text-sm text-muted-foreground">Note: {s.reviewNote}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Submitted {new Date(s.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {s.screenshotUrl && (
                      <a
                        href={s.screenshotUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-24 w-36 flex-shrink-0 overflow-hidden rounded-lg border border-border"
                      >
                        <img
                          src={s.screenshotUrl}
                          alt="Payment screenshot"
                          className="h-full w-full object-cover"
                        />
                      </a>
                    )}
                    {s.status === "pending" && (
                      <div className="flex flex-shrink-0 gap-2">
                        <Button
                          size="sm"
                          onClick={() => setActiveId(s.id)}
                        >
                          Review
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {query.data?.submissions.length === 0 && (
                <p className="py-12 text-center text-muted-foreground">No payment submissions yet.</p>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={!!activeId} onOpenChange={(open) => !open && setActiveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="note">Review note (optional)</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for rejection or any note"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setActiveId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={processing}
              onClick={() => handleReview("reject")}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="mr-1 h-4 w-4" />}
              Reject
            </Button>
            <Button disabled={processing} onClick={() => handleReview("approve")}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
