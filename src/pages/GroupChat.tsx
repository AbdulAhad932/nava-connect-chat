import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Send, Settings } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Group {
  id: string;
  name: string;
  photo_url: string | null;
}
interface Message {
  id: string;
  sender_id: string;
  group_id: string | null;
  message: string | null;
  created_at: string;
}
interface Profile {
  id: string;
  name: string | null;
  photo_url: string | null;
}

const GroupChat = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return navigate("/auth", { replace: true });
    if (!groupId) return;
    (async () => {
      const { data: g } = await supabase
        .from("groups")
        .select("id,name,photo_url")
        .eq("id", groupId)
        .maybeSingle();
      if (!g) {
        toast.error("Group not found or no access");
        navigate("/");
        return;
      }
      setGroup(g as Group);

      const { data: ms } = await supabase
        .from("messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });
      setMessages((ms ?? []) as Message[]);

      // members for avatar/name
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId);
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,name,photo_url")
          .in("id", ids);
        const map: Record<string, Profile> = {};
        (profs ?? []).forEach((p: any) => (map[p.id] = p));
        setProfiles(map);
      }
      setReady(true);
    })();
  }, [user, loading, groupId, navigate]);

  useEffect(() => {
    if (!groupId) return;
    const ch = supabase
      .channel(`group-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m]
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const send = async () => {
    if (!text.trim() || !user || !groupId) return;
    setSending(true);
    const body = text.trim();
    setText("");
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      group_id: groupId,
      message: body,
      media_type: "text",
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      setText(body);
    }
  };

  if (loading || !ready || !group) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
        <button
          onClick={() => navigate(`/group/${group.id}/info`)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <Avatar className="h-10 w-10 border-2 border-primary-foreground/30">
            <AvatarImage src={group.photo_url ?? undefined} />
            <AvatarFallback className="bg-primary-dark text-primary-foreground">
              {group.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-semibold truncate">{group.name}</p>
            <p className="text-xs text-primary-foreground/80">Tap for group info</p>
          </div>
        </button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate(`/group/${group.id}/info`)}
          className="text-primary-foreground hover:bg-primary-foreground/10 h-9 w-9"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            Group chat shuru karein 👋
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user!.id;
          const author = profiles[m.sender_id];
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"} gap-2`}
            >
              {!mine && (
                <Avatar className="h-7 w-7 mt-auto">
                  <AvatarImage src={author?.photo_url ?? undefined} />
                  <AvatarFallback className="text-[10px] bg-accent text-primary">
                    {(author?.name?.[0] || "?").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm ${
                  mine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-background text-foreground rounded-bl-sm"
                }`}
              >
                {!mine && (
                  <p className="text-[11px] font-semibold text-primary mb-0.5">
                    {author?.name || "User"}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">
                  {m.message}
                </p>
                <p
                  className={`text-[10px] mt-0.5 text-right ${
                    mine ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  {format(new Date(m.created_at), "HH:mm")}
                </p>
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
          placeholder="Group ko message bhejein..."
          className="h-11 rounded-full px-4"
        />
        <Button
          onClick={send}
          disabled={sending || !text.trim()}
          size="icon"
          className="h-11 w-11 rounded-full bg-gradient-primary shadow-glow shrink-0"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
};

export default GroupChat;
