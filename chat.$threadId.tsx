import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { streamChat, generateImage, signedImageUrl, type StreamEvent } from "@/lib/chat-client";
import {
  listThreads,
  loadMessages,
  renameThread,
  deleteThread,
  createThread,
  clearAllThreads,
} from "@/lib/chat.functions";
import { getSubscriptionStatus } from "@/lib/subscriptions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Menu,
  MessageSquarePlus,
  MoreVertical,
  Pencil,
  Trash2,
  ImageIcon,
  BrainCircuit,
  Crown,
  LogOut,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute("/chat/$threadId")({
  component: ChatThreadPage,
  head: () => ({
    meta: [
      { title: "Chat — Sindhi AI" },
      { name: "description", content: "Chat with Sindhi AI in your language." },
      { property: "og:title", content: "Chat — Sindhi AI" },
      { property: "og:description", content: "Chat with Sindhi AI in your language." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind: string;
  imageUrl?: string | null;
  reasoning?: string | null;
  pending?: boolean;
};

function ChatThreadPage() {
  const { threadId } = useParams({ from: "/chat/$threadId" });
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const list = useServerFn(listThreads);
  const load = useServerFn(loadMessages);
  const rename = useServerFn(renameThread);
  const remove = useServerFn(deleteThread);
  const create = useServerFn(createThread);
  const clearAll = useServerFn(clearAllThreads);
  const getSub = useServerFn(getSubscriptionStatus);

  const threadsQuery = useQuery({
    queryKey: ["threads"],
    queryFn: list,
  });

  const messagesQuery = useQuery({
    queryKey: ["threads", threadId, "messages"],
    queryFn: () => load({ threadId }),
    enabled: !!threadId,
  });

  const subQuery = useQuery({
    queryKey: ["subscription"],
    queryFn: getSub,
  });

  const isPro = subQuery.data?.isPro ?? false;

  const [input, setInput] = useState("");
  const [deepThinking, setDeepThinking] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const thread = useMemo(
    () => threadsQuery.data?.find((t) => t.id === threadId),
    [threadsQuery.data, threadId],
  );

  useEffect(() => {
    if (messagesQuery.data) {
      setLocalMessages(
        messagesQuery.data.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          kind: m.kind,
          imageUrl: m.image_url,
          reasoning: m.reasoning,
        })),
      );
    }
  }, [messagesQuery.data]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [localMessages, streaming]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || streaming || generatingImage) return;

    const userMsg: LocalMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      kind: "text",
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    let assistantId = crypto.randomUUID();
    let reasoningText = "";

    try {
      await streamChat(
        { threadId, text, deepThinking: deepThinking && isPro },
        (event: StreamEvent) => {
          if (event.type === "start") {
            setLocalMessages((prev) => [
              ...prev,
              {
                id: assistantId,
                role: "assistant",
                content: "",
                kind: "text",
                reasoning: "",
                pending: true,
              },
            ]);
          } else if (event.type === "text") {
            setLocalMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + event.delta, pending: false }
                  : m,
              ),
            );
          } else if (event.type === "reasoning") {
            reasoningText += event.delta;
            setLocalMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, reasoning: reasoningText } : m)),
            );
          } else if (event.type === "done") {
            queryClient.invalidateQueries({ queryKey: ["threads"] });
            queryClient.invalidateQueries({ queryKey: ["threads", threadId, "messages"] });
          } else if (event.type === "error") {
            toast.error(event.message);
          }
        },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chat failed.");
    } finally {
      setStreaming(false);
    }
  }

  async function handleImage() {
    const prompt = input.trim();
    if (!prompt || streaming || generatingImage) return;

    setGeneratingImage(true);
    setInput("");
    setLocalMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: prompt, kind: "image_prompt" },
    ]);

    try {
      const path = await generateImage({ threadId, prompt });
      if (!path) throw new Error("No image returned");
      const url = await signedImageUrl(path);
      setLocalMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: prompt,
          kind: "image",
          imageUrl: url,
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ["threads", threadId, "messages"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image generation failed.");
    } finally {
      setGeneratingImage(false);
    }
  }

  function startRename(id: string, title: string) {
    setActiveThreadId(id);
    setRenameValue(title);
    setRenameOpen(true);
  }

  async function confirmRename() {
    if (!activeThreadId || !renameValue.trim()) return;
    try {
      await rename({ threadId: activeThreadId, title: renameValue.trim() });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      setRenameOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed.");
    }
  }

  async function confirmDelete(id: string) {
    try {
      await remove({ threadId: id });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      if (id === threadId) {
        navigate({ to: "/chat" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function newChat() {
    try {
      const id = await createThread({});
      navigate({ to: "/chat/$threadId", params: { threadId: id } });
    } catch {
      toast.error("Could not create a new chat.");
    }
  }

  async function handleClearAll() {
    if (!confirm("Delete all of your chat history? This cannot be undone.")) return;
    try {
      await clearAll({});
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      const id = await createThread({});
      navigate({ to: "/chat/$threadId", params: { threadId: id } });
      toast.success("All chat history cleared.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear chat history.");
    }
  }

  const sidebarContent = (
    <div className="flex h-full flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between p-4">
        <Link to="/" className="flex items-center gap-2 text-sidebar-foreground">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-bold">S</span>
          </div>
          <span className="font-display text-lg font-bold">Sindhi AI</span>
        </Link>
      </div>
      <div className="px-3 pb-2">
        <Button onClick={newChat} className="w-full gap-2" variant="secondary">
          <MessageSquarePlus className="h-4 w-4" /> New chat
        </Button>
      </div>
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-1">
          {threadsQuery.data?.map((t) => (
            <div
              key={t.id}
              className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                t.id === threadId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <Link
                to="/chat/$threadId"
                params={{ threadId: t.id }}
                className="flex-1 truncate"
              >
                {t.title || "New chat"}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  >
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => startRename(t.id, t.title)}>
                    <Pencil className="mr-2 h-4 w-4" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => confirmDelete(t.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="border-t border-sidebar-border p-3">
        <Button variant="ghost" className="mb-2 w-full justify-start gap-2 text-destructive" onClick={handleClearAll}>
          <Trash2 className="h-4 w-4" /> Clear all history
        </Button>
        <div className="mb-3 flex items-center justify-between rounded-lg bg-sidebar-accent/50 p-3">
          <div className="flex items-center gap-2 text-sm text-sidebar-foreground">
            <Crown className="h-4 w-4 text-primary" />
            <span>{isPro ? "Pro" : "Free plan"}</span>
          </div>
          {!isPro && (
            <Link to="/pricing">
              <Button size="sm" variant="outline" className="h-7 text-xs">
                Upgrade
              </Button>
            </Link>
          )}
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sidebar-foreground"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 flex-shrink-0 md:block">{sidebarContent}</aside>

      {/* Mobile sidebar */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="absolute left-4 top-4 z-20 md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          {sidebarContent}
        </SheetContent>
      </Sheet>

      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6">
          <h2 className="ml-10 truncate text-sm font-medium text-foreground md:ml-0">
            {thread?.title || "New chat"}
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="deep-thinking"
                checked={deepThinking}
                onCheckedChange={setDeepThinking}
                disabled={!isPro}
              />
              <Label htmlFor="deep-thinking" className="flex items-center gap-1 text-xs">
                <BrainCircuit className="h-3.5 w-3.5" />
                Deep thinking
                {!isPro && <span className="text-muted-foreground">(Pro)</span>}
              </Label>
            </div>
          </div>
        </header>

        <ScrollArea className="flex-1 px-4 py-6 md:px-8" ref={scrollRef}>
          <div className="mx-auto max-w-3xl space-y-6">
            {localMessages.length === 0 && (
              <div className="py-20 text-center text-muted-foreground">
                <p className="text-lg font-medium">Sindhi AI kay saath baat karo</p>
                <p className="mt-2 text-sm">Type in Sindhi, Urdu, Roman, English — or any mix.</p>
              </div>
            )}
            {localMessages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {(streaming || generatingImage) && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{generatingImage ? "Generating image..." : "Thinking..."}</span>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border bg-card p-4">
          <form
            onSubmit={handleSend}
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-input bg-background p-2 shadow-sm"
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type your message..."
              rows={1}
              className="min-h-0 flex-1 resize-none border-0 bg-transparent px-3 py-2 focus-visible:ring-0"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={!input.trim() || streaming || generatingImage}
              onClick={handleImage}
              title="Generate image"
            >
              <ImageIcon className="h-5 w-5" />
            </Button>
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || streaming || generatingImage}
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {isPro
              ? "Pro — unlimited messages & images"
              : "Free: 15 messages per hour • automatic reset every hour"}
          </p>
        </div>
      </main>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Chat title"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageBubble({ message }: { message: LocalMessage }) {
  const isUser = message.role === "user";
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm md:max-w-[75%] ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-none"
            : "bg-muted text-foreground rounded-bl-none"
        }`}
      >
        {message.kind === "image" && message.imageUrl ? (
          <img
            src={message.imageUrl}
            alt="Generated"
            className="max-h-80 rounded-lg object-contain"
            loading="lazy"
          />
        ) : message.kind === "image_prompt" ? (
          <p className="italic opacity-80">🎨 {message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || " "}</ReactMarkdown>
          </div>
        )}

        {!isUser && message.reasoning && (
          <div className="mt-3 border-t border-border/50 pt-2">
            <button
              onClick={() => setShowReasoning((s) => !s)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showReasoning ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Reasoning
            </button>
            {showReasoning && (
              <div className="mt-2 text-xs text-muted-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.reasoning}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
