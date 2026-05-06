import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global in-app notifications: listens for new messages addressed to me
 * and shows a sonner toast. Click → navigate to chat.
 */
export function useGlobalNotifications(userId: string | undefined) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!userId) return;

    // Ask browser permission once (best-effort, non-blocking)
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const channel = supabase
      .channel(`notify:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${userId}`,
        },
        async (payload) => {
          const m: any = payload.new;
          if (m.sender_id === userId) return;

          // Don't notify if user is already on that chat
          if (location.pathname === `/chat/${m.sender_id}`) return;

          const { data: sender } = await supabase
            .from("profiles")
            .select("name, photo_url")
            .eq("id", m.sender_id)
            .maybeSingle();

          const name = sender?.name || "New message";
          const preview =
            m.media_type === "image"
              ? "📷 Photo"
              : m.media_type === "document"
              ? `📎 ${m.media_name || "File"}`
              : m.media_type === "voice"
              ? "🎤 Voice message"
              : m.message || "";

          toast(name, {
            description: preview,
            action: {
              label: "Open",
              onClick: () => navigate(`/chat/${m.sender_id}`),
            },
          });

          if ("Notification" in window && Notification.permission === "granted") {
            try {
              const n = new Notification(name, { body: preview, icon: sender?.photo_url ?? undefined });
              n.onclick = () => {
                window.focus();
                navigate(`/chat/${m.sender_id}`);
              };
            } catch {}
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, navigate, location.pathname]);
}
