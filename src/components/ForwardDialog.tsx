import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, Send } from "lucide-react";
import { toast } from "sonner";

interface SourceMsg {
  id: string;
  message: string | null;
  media_url: string | null;
  media_type: string;
  media_name: string | null;
  media_size: number | null;
  duration_ms: number | null;
}

interface UserOpt {
  id: string;
  name: string | null;
  photo_url: string | null;
}

export const ForwardDialog = ({
  open,
  onOpenChange,
  message,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: SourceMsg | null;
}) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setPicked(new Set());
    setQ("");
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,name,photo_url")
        .neq("id", user.id)
        .order("name");
      setUsers((data ?? []) as UserOpt[]);
    })();
  }, [open, user]);

  const toggle = (id: string) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };

  const send = async () => {
    if (!message || !user || picked.size === 0) return;
    setSending(true);
    const rows = Array.from(picked).map((rid) => ({
      sender_id: user.id,
      receiver_id: rid,
      message: message.message ?? "",
      media_type: message.media_type,
      media_url: message.media_url,
      media_name: message.media_name,
      media_size: message.media_size,
      duration_ms: message.duration_ms,
      forwarded_from_id: message.id,
    }));
    const { error } = await supabase.from("messages").insert(rows);
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success(`Forwarded to ${picked.size} chat${picked.size > 1 ? "s" : ""}`);
    onOpenChange(false);
  };

  const filtered = users.filter((u) =>
    (u.name ?? "").toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Forward to...</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search users..."
            className="pl-9 h-10 rounded-xl"
          />
        </div>
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1">
          {filtered.map((u) => (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted/60 text-left"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={u.photo_url ?? undefined} />
                <AvatarFallback>
                  {(u.name?.[0] ?? "?").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 text-sm font-medium truncate">
                {u.name ?? "User"}
              </span>
              <Checkbox checked={picked.has(u.id)} />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">
              No users
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={send}
            disabled={sending || picked.size === 0}
            className="bg-gradient-primary"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" /> Forward ({picked.size})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
