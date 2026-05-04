import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Check, CheckCheck, Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface Profile {
  id: string;
  name: string | null;
  photo_url: string | null;
  is_online: boolean;
  last_seen: string;
}

const Chat = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [other, setOther] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    if (!userId) return;
    (async () => {
      const { data: o } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      setOther(o as Profile);

      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true });
      setMessages((msgs ?? []) as Message[]);

      // Mark received messages as read
      await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("sender_id", userId)
        .eq("receiver_id", user.id)
        .eq("is_read", false);

      setReady(true);
    })();
  }, [user, loading, userId, navigate]);

  useEffect(() => {
    if (!user || !userId) return;
    const channel = supabase
      .channel(`chat-${user.id}-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const m = payload.new as Message;
          const involved =
            (m.sender_id === user.id && m.receiver_id === userId) ||
            (m.sender_id === userId && m.receiver_id === user.id);
          if (!involved) return;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m]
          );
          if (m.receiver_id === user.id) {
            await supabase
              .from("messages")
              .update({ is_read: true })
              .eq("id", m.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? m : x))
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const send = async () => {
    if (!text.trim() || !user || !userId) return;
    setSending(true);
    const body = text.trim();
    setText("");
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      receiver_id: userId,
      message: body,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      setText(body);
    }
  };

  if (loading || !ready || !other) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-chat-bg">
      <header className="bg-gradient-primary text-primary-foreground px-3 py-3 flex items-center gap-3 shadow-soft">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate("/")}
          className="text-primary-foreground hover:bg-primary-foreground/10 h-9 w-9"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10 border-2 border-primary-foreground/30">
          <AvatarImage src={other.photo_url ?? undefined} />
          <AvatarFallback className="bg-primary-dark text-primary-foreground">
            {(other.name?.[0] || "?").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{other.name || "User"}</p>
          <p className="text-xs text-primary-foreground/80">
            {other.is_online ? "online" : "offline"}
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            Koi message nahi. Pehla message bhejein 👋
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user!.id;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm ${
                  mine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-background text-foreground rounded-bl-sm"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">
                  {m.message}
                </p>
                <div
                  className={`flex items-center gap-1 justify-end mt-0.5 text-[10px] ${
                    mine
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  }`}
                >
                  <span>{format(new Date(m.created_at), "HH:mm")}</span>
                  {mine &&
                    (m.is_read ? (
                      <CheckCheck className="h-3.5 w-3.5 text-sky-300" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-background border-t px-3 py-2 flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message likhein..."
          className="h-11 rounded-full px-4"
        />
        <Button
          onClick={send}
          disabled={sending || !text.trim()}
          size="icon"
          className="h-11 w-11 rounded-full bg-gradient-primary shadow-glow shrink-0"
        >
          {sending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
};

export default Chat;
