import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Loader2, Star, StarOff } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface StarRow {
  id: string;
  message_id: string;
  message?: {
    id: string;
    sender_id: string;
    receiver_id: string | null;
    group_id: string | null;
    message: string | null;
    media_type: string;
    media_name: string | null;
    created_at: string;
    is_deleted_for_everyone: boolean;
  };
}

const Starred = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<StarRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    (async () => {
      const { data: stars } = await supabase
        .from("starred_messages")
        .select("id, message_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const ids = (stars ?? []).map((s: any) => s.message_id);
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .in("id", ids);
      const map = new Map((msgs ?? []).map((m: any) => [m.id, m]));
      setRows(
        (stars ?? []).map((s: any) => ({ ...s, message: map.get(s.message_id) }))
      );
      setLoading(false);
    })();
  }, [user, navigate]);

  const unstar = async (id: string) => {
    const { error } = await supabase.from("starred_messages").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const open = (msg: StarRow["message"]) => {
    if (!msg || !user) return;
    if (msg.group_id) navigate(`/group/${msg.group_id}`);
    else {
      const other = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      if (other) navigate(`/chat/${other}`);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-gradient-primary text-primary-foreground px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-soft">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate(-1)}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Star className="h-5 w-5" />
        <h1 className="text-xl font-bold">Starred Messages</h1>
      </header>

      <div className="max-w-md mx-auto px-3 py-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            No starred messages yet
          </p>
        ) : (
          rows.map((r) => {
            const m = r.message;
            if (!m) return null;
            const preview = m.is_deleted_for_everyone
              ? "🚫 This message was deleted"
              : m.media_type === "image"
                ? "📷 Photo"
                : m.media_type === "document"
                  ? `📎 ${m.media_name ?? "Document"}`
                  : m.media_type === "voice"
                    ? "🎤 Voice message"
                    : m.message ?? "";
            return (
              <div
                key={r.id}
                className="rounded-2xl border bg-card p-3 flex gap-3"
              >
                <button
                  onClick={() => open(m)}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="text-sm break-words">{preview}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {format(new Date(m.created_at), "MMM d, HH:mm")}
                  </p>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => unstar(r.id)}
                  aria-label="Unstar"
                >
                  <StarOff className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Starred;
