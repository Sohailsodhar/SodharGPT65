import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Sindhi AI — Multilingual Chatbot" },
      { name: "description", content: "Chat in Sindhi, Urdu, Roman or English with Sindhi AI." },
      { property: "og:title", content: "Sindhi AI — Multilingual Chatbot" },
      { property: "og:description", content: "Chat in Sindhi, Urdu, Roman or English with Sindhi AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" />;
  }

  return <Navigate to="/chat" />;
}
