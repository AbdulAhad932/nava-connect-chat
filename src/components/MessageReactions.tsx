import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🙏"];

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface Props {
  messageIds: string[];
  /** Render children with reaction context: shows picker on long-press and reactions row */
  children: (api: {
    bind: (messageId: string) => {
      onPointerDown: (e: React.PointerEvent) => void;
      onPointerUp: () => void;
      onPointerLeave: () => void;
      onContextMenu: (e: React.MouseEvent) => void;
    };
    renderReactions: (messageId: string, mine: boolean) => React.ReactNode;
    pickerNode: React.ReactNode;
  }) => React.ReactNode;
}

export const MessageReactions = ({ messageIds, children }: Props) => {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const pressTimerRef = useRef<number | null>(null);

  // Fetch reactions for current messages
  useEffect(() => {
    if (messageIds.length === 0) {
      setReactions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("message_reactions")
        .select("*")
        .in("message_id", messageIds);
      if (!cancelled) setReactions((data ?? []) as Reaction[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [messageIds.join(",")]);

  // Realtime subscribe to reactions
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`reactions:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.new as Reaction;
          if (!messageIds.includes(r.message_id)) return;
          setReactions((prev) =>
            prev.some((x) => x.id === r.id) ? prev : [...prev, r]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.old as Reaction;
          setReactions((prev) => prev.filter((x) => x.id !== r.id));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, messageIds.join(",")]);

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find(
      (r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji
    );
    if (existing) {
      setReactions((prev) => prev.filter((x) => x.id !== existing.id));
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      const { data, error } = await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: user.id, emoji })
        .select()
        .single();
      if (!error && data) {
        setReactions((prev) =>
          prev.some((x) => x.id === data.id) ? prev : [...prev, data as Reaction]
        );
      }
    }
    setPickerFor(null);
  };

  const bind = (messageId: string) => ({
    onPointerDown: (_e: React.PointerEvent) => {
      if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = window.setTimeout(() => {
        setPickerFor(messageId);
      }, 450);
    },
    onPointerUp: () => {
      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    },
    onPointerLeave: () => {
      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setPickerFor(messageId);
    },
  });

  const renderReactions = (messageId: string, mine: boolean) => {
    const list = reactions.filter((r) => r.message_id === messageId);
    if (list.length === 0) return null;
    const groups = list.reduce<Record<string, Reaction[]>>((acc, r) => {
      (acc[r.emoji] ||= []).push(r);
      return acc;
    }, {});
    return (
      <div
        className={cn(
          "flex flex-wrap gap-1 mt-1 px-1",
          mine ? "justify-end" : "justify-start"
        )}
      >
        {Object.entries(groups).map(([emoji, rs]) => {
          const reactedByMe = rs.some((r) => r.user_id === user?.id);
          return (
            <button
              key={emoji}
              onClick={(e) => {
                e.stopPropagation();
                toggleReaction(messageId, emoji);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs bg-background hover:bg-muted transition shadow-sm",
                reactedByMe
                  ? "border-primary/60 text-primary"
                  : "border-border text-foreground"
              )}
            >
              <span className="text-sm leading-none">{emoji}</span>
              <span className="text-[10px] font-medium">{rs.length}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const pickerNode = pickerFor ? (
    <div
      className="fixed inset-0 z-[80] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setPickerFor(null)}
    >
      <div
        className="bg-background rounded-full shadow-2xl border px-2 py-2 flex items-center gap-1 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => toggleReaction(pickerFor, emoji)}
            className="text-2xl hover:scale-125 active:scale-110 transition-transform p-2 rounded-full hover:bg-muted"
            aria-label={`React ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return <>{children({ bind, renderReactions, pickerNode })}</>;
};
