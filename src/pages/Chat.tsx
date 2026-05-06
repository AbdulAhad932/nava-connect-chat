import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalPresence } from "@/hooks/usePresence";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Pause,
  Phone,
  Play,
  Send,
  Square,
  Video,
  X,
} from "lucide-react";
import { useCall } from "@/contexts/CallContext";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MediaType = "text" | "image" | "document" | "voice";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string | null;
  is_read: boolean;
  is_delivered: boolean;
  created_at: string;
  media_url: string | null;
  media_type: MediaType;
  media_name: string | null;
  media_size: number | null;
  duration_ms: number | null;
}

interface Profile {
  id: string;
  name: string | null;
  photo_url: string | null;
  is_online: boolean;
  last_seen: string;
}

const fmtSize = (b?: number | null) => {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};
const fmtDur = (ms?: number | null) => {
  if (!ms) return "0:00";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
};

const Chat = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [other, setOther] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onlineSet = useGlobalPresence(user?.id);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastSentTypingRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef<number>(0);
  const recTimerRef = useRef<number | null>(null);

  const isOtherOnline = userId ? onlineSet.has(userId) : false;

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

      await supabase
        .from("messages")
        .update({ is_delivered: true, is_read: true })
        .eq("sender_id", userId)
        .eq("receiver_id", user.id)
        .eq("is_read", false);

      setReady(true);
    })();
  }, [user, loading, userId, navigate]);

  // Realtime messages
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
              .update({ is_delivered: true, is_read: true })
              .eq("id", m.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, userId]);

  // Typing
  useEffect(() => {
    if (!user || !userId) return;
    const pairKey = [user.id, userId].sort().join(":");
    const ch = supabase.channel(`typing:${pairKey}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "typing" }, (payload: any) => {
      if (payload?.payload?.userId !== userId) return;
      setOtherTyping(true);
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(
        () => setOtherTyping(false),
        2500
      );
    }).on("broadcast", { event: "stop_typing" }, (payload: any) => {
      if (payload?.payload?.userId !== userId) return;
      setOtherTyping(false);
    });
    ch.subscribe();
    typingChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      typingChannelRef.current = null;
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    };
  }, [user, userId]);

  // Resolve signed URLs for media messages
  const mediaPaths = useMemo(
    () =>
      messages
        .filter((m) => m.media_url && !signed[m.media_url])
        .map((m) => m.media_url as string),
    [messages, signed]
  );
  useEffect(() => {
    if (mediaPaths.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const p of mediaPaths) {
        const { data } = await supabase.storage
          .from("chat-media")
          .createSignedUrl(p, 60 * 60);
        if (data?.signedUrl) updates[p] = data.signedUrl;
      }
      if (!cancelled && Object.keys(updates).length) {
        setSigned((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaPaths]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, otherTyping]);

  const broadcastTyping = () => {
    if (!typingChannelRef.current || !user) return;
    const now = Date.now();
    if (now - lastSentTypingRef.current < 1500) return;
    lastSentTypingRef.current = now;
    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user.id },
    });
  };
  const stopTyping = () => {
    if (!typingChannelRef.current || !user) return;
    lastSentTypingRef.current = 0;
    typingChannelRef.current.send({
      type: "broadcast",
      event: "stop_typing",
      payload: { userId: user.id },
    });
  };

  const sendText = async () => {
    if (!text.trim() || !user || !userId) return;
    setSending(true);
    const body = text.trim();
    setText("");
    stopTyping();
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      receiver_id: userId,
      message: body,
      media_type: "text",
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      setText(body);
    }
  };

  const uploadAndSend = async (
    file: Blob,
    mediaType: MediaType,
    name: string,
    durationMs?: number
  ) => {
    if (!user || !userId) return;
    setSending(true);
    try {
      const ext = name.includes(".") ? name.split(".").pop() : "bin";
      const path = `${user.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-media")
        .upload(path, file, {
          contentType: (file as File).type || "application/octet-stream",
        });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("messages").insert({
        sender_id: user.id,
        receiver_id: userId,
        message: "",
        media_type: mediaType,
        media_url: path,
        media_name: name,
        media_size: (file as File).size ?? file.size,
        duration_ms: durationMs ?? null,
      });
      if (insErr) throw insErr;
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setSending(false);
    }
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please pick an image");
      return;
    }
    await uploadAndSend(f, "image", f.name);
  };
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await uploadAndSend(f, "document", f.name);
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recChunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) recChunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        const dur = Date.now() - recStartRef.current;
        const blob = new Blob(recChunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((t) => t.stop());
        await uploadAndSend(
          new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }),
          "voice",
          `voice-${Date.now()}.webm`,
          dur
        );
      };
      mr.start();
      recRef.current = mr;
      recStartRef.current = Date.now();
      setRecording(true);
      setRecElapsed(0);
      recTimerRef.current = window.setInterval(() => {
        setRecElapsed(Date.now() - recStartRef.current);
      }, 200);
    } catch (e: any) {
      toast.error(e.message ?? "Mic access denied");
    }
  };
  const stopRec = (cancel = false) => {
    if (!recRef.current) return;
    if (recTimerRef.current) window.clearInterval(recTimerRef.current);
    if (cancel) {
      recRef.current.ondataavailable = null as any;
      recRef.current.onstop = null as any;
      try {
        recRef.current.stop();
      } catch {}
      // stop tracks
      // @ts-ignore
      recRef.current.stream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    } else {
      recRef.current.stop();
    }
    recRef.current = null;
    setRecording(false);
    setRecElapsed(0);
  };

  if (loading || !ready || !other) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statusText = otherTyping
    ? "typing..."
    : isOtherOnline
      ? "online"
      : other.last_seen
        ? `last seen ${formatDistanceToNowStrict(new Date(other.last_seen), { addSuffix: true })}`
        : "offline";

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
        <div className="relative">
          <Avatar className="h-10 w-10 border-2 border-primary-foreground/30">
            <AvatarImage src={other.photo_url ?? undefined} />
            <AvatarFallback className="bg-primary-dark text-primary-foreground">
              {(other.name?.[0] || "?").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {isOtherOnline && (
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-400 border-2 border-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{other.name || "User"}</p>
          <p className="text-xs text-primary-foreground/80 truncate">
            {statusText}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() =>
            startCall(
              { id: other.id, name: other.name, photo_url: other.photo_url },
              "audio"
            )
          }
          className="text-primary-foreground hover:bg-primary-foreground/10 h-9 w-9"
          aria-label="Voice call"
        >
          <Phone className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() =>
            startCall(
              { id: other.id, name: other.name, photo_url: other.photo_url },
              "video"
            )
          }
          className="text-primary-foreground hover:bg-primary-foreground/10 h-9 w-9"
          aria-label="Video call"
        >
          <Video className="h-5 w-5" />
        </Button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            Koi message nahi. Pehla message bhejein 👋
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user!.id;
          const url = m.media_url ? signed[m.media_url] : undefined;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-2 py-2 shadow-sm ${
                  mine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-background text-foreground rounded-bl-sm"
                }`}
              >
                {m.media_type === "image" && (
                  <div className="mb-1">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        <img
                          src={url}
                          alt={m.media_name ?? "image"}
                          className="rounded-lg max-h-64 object-cover"
                        />
                      </a>
                    ) : (
                      <div className="h-40 w-56 rounded-lg bg-muted/40 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin opacity-70" />
                      </div>
                    )}
                  </div>
                )}
                {m.media_type === "document" && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 mb-1 ${
                      mine ? "bg-primary-foreground/10" : "bg-muted/60"
                    }`}
                  >
                    <FileText className="h-6 w-6 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate max-w-[180px]">
                        {m.media_name || "file"}
                      </p>
                      <p className="text-[11px] opacity-75">
                        {fmtSize(m.media_size)}
                      </p>
                    </div>
                  </a>
                )}
                {m.media_type === "voice" && (
                  <VoicePlayer
                    url={url}
                    durationMs={m.duration_ms ?? 0}
                    mine={mine}
                  />
                )}
                {m.message && (
                  <p className="text-sm whitespace-pre-wrap break-words px-1">
                    {m.message}
                  </p>
                )}
                <div
                  className={`flex items-center gap-1 justify-end mt-0.5 text-[10px] px-1 ${
                    mine
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  }`}
                >
                  <span>{format(new Date(m.created_at), "HH:mm")}</span>
                  {mine &&
                    (m.is_read ? (
                      <CheckCheck className="h-3.5 w-3.5 text-sky-300" />
                    ) : m.is_delivered ? (
                      <CheckCheck className="h-3.5 w-3.5" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    ))}
                </div>
              </div>
            </div>
          );
        })}

        {otherTyping && (
          <div className="flex justify-start">
            <div className="bg-background text-foreground rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" />
                <span className="ml-1 text-[11px] text-muted-foreground">
                  {(other.name?.split(" ")[0] || "User")} is typing...
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickImage}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onPickFile}
      />

      {recording ? (
        <div className="bg-background border-t px-3 py-2 flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => stopRec(true)}
            className="text-destructive h-11 w-11"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
            <div className="flex-1 flex items-end gap-0.5 h-6">
              {Array.from({ length: 24 }).map((_, i) => (
                <span
                  key={i}
                  className="flex-1 bg-primary/60 rounded-sm animate-pulse"
                  style={{
                    height: `${30 + ((i * 17 + recElapsed / 60) % 70)}%`,
                    animationDelay: `${i * 40}ms`,
                  }}
                />
              ))}
            </div>
            <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
              {fmtDur(recElapsed)}
            </span>
          </div>
          <Button
            onClick={() => stopRec(false)}
            size="icon"
            className="h-11 w-11 rounded-full bg-gradient-primary shadow-glow shrink-0"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      ) : (
        <div className="bg-background border-t px-3 py-2 flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11 shrink-0"
                disabled={sending}
              >
                <Paperclip className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                <ImageIcon className="h-4 w-4 mr-2" /> Image
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <FileText className="h-4 w-4 mr-2" /> Document
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) broadcastTyping();
              else stopTyping();
            }}
            onBlur={stopTyping}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendText();
              }
            }}
            placeholder="Message likhein..."
            className="h-11 rounded-full px-4"
          />
          {text.trim() ? (
            <Button
              onClick={sendText}
              disabled={sending}
              size="icon"
              className="h-11 w-11 rounded-full bg-gradient-primary shadow-glow shrink-0"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          ) : (
            <Button
              onClick={startRec}
              disabled={sending}
              size="icon"
              className="h-11 w-11 rounded-full bg-gradient-primary shadow-glow shrink-0"
            >
              <Mic className="h-5 w-5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

const VoicePlayer = ({
  url,
  durationMs,
  mine,
}: {
  url?: string;
  durationMs: number;
  mine: boolean;
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = 28;
  const heights = useMemo(
    () =>
      Array.from({ length: bars }).map(
        (_, i) => 30 + ((i * 53 + 17) % 70)
      ),
    []
  );
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () =>
      setProgress(a.duration ? a.currentTime / a.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, [url]);
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play();
      setPlaying(true);
    }
  };
  return (
    <div className={`flex items-center gap-2 px-1 py-1 min-w-[200px]`}>
      {url && <audio ref={audioRef} src={url} preload="metadata" />}
      <Button
        size="icon"
        variant="ghost"
        onClick={toggle}
        disabled={!url}
        className={`h-8 w-8 rounded-full shrink-0 ${
          mine ? "bg-primary-foreground/15 hover:bg-primary-foreground/25" : "bg-muted"
        }`}
      >
        {!url ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      <div className="flex-1 flex items-end gap-0.5 h-6">
        {heights.map((h, i) => {
          const active = i / bars <= progress;
          return (
            <span
              key={i}
              className={`flex-1 rounded-sm ${
                active
                  ? mine
                    ? "bg-primary-foreground"
                    : "bg-primary"
                  : mine
                    ? "bg-primary-foreground/40"
                    : "bg-primary/30"
              }`}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <span className="text-[10px] tabular-nums opacity-80 w-9 text-right">
        {fmtDur(durationMs)}
      </span>
    </div>
  );
};

export default Chat;
