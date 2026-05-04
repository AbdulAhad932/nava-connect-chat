import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global presence: tracks all online users via a shared Realtime channel.
 * Returns a Set of online user IDs. Also writes is_online/last_seen to profiles.
 */
export function useGlobalPresence(userId: string | undefined) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("presence:global", {
      config: { presence: { key: userId } },
    });

    const sync = () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      setOnline(new Set(Object.keys(state)));
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
          await supabase
            .from("profiles")
            .update({ is_online: true, last_seen: new Date().toISOString() })
            .eq("id", userId);
        }
      });

    const markOffline = async () => {
      await supabase
        .from("profiles")
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .eq("id", userId);
    };

    const onHide = () => {
      if (document.visibilityState === "hidden") markOffline();
    };
    window.addEventListener("beforeunload", markOffline);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      markOffline();
      window.removeEventListener("beforeunload", markOffline);
      document.removeEventListener("visibilitychange", onHide);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return online;
}
