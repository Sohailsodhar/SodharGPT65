import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { createThread } from "@/lib/chat.functions";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  const navigate = useNavigate();
  const create = useServerFn(createThread);

  useEffect(() => {
    let cancelled = false;
    create({})
      .then((id) => {
        if (!cancelled) navigate({ to: "/chat/$threadId", params: { threadId: id } });
      })
      .catch((err) => {
        toast.error(err.message ?? "Could not start a new chat.");
      });
    return () => {
      cancelled = true;
    };
  }, [create, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
