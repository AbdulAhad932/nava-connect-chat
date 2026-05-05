import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Check, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

interface Profile {
  id: string;
  name: string | null;
  photo_url: string | null;
}

const CreateGroup = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) return navigate("/auth", { replace: true });
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,name,photo_url")
        .neq("id", user.id)
        .order("name");
      setUsers((data ?? []) as Profile[]);
    })();
  }, [user, loading, navigate]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const create = async () => {
    if (!user) return;
    if (!name.trim()) return toast.error("Group ka naam likhein");
    if (selected.size === 0) return toast.error("Kam se kam 1 member chunein");
    setCreating(true);
    try {
      const { data: g, error } = await supabase
        .from("groups")
        .insert({ name: name.trim(), created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      // creator as admin
      const rows = [
        { group_id: g.id, user_id: user.id, role: "admin" as const },
        ...Array.from(selected).map((uid) => ({
          group_id: g.id,
          user_id: uid,
          role: "member" as const,
        })),
      ];
      // creator first (RLS requires no members yet for self-insert)
      const { error: meErr } = await supabase
        .from("group_members")
        .insert(rows[0]);
      if (meErr) throw meErr;
      if (rows.length > 1) {
        const { error: memErr } = await supabase
          .from("group_members")
          .insert(rows.slice(1));
        if (memErr) throw memErr;
      }
      toast.success("Group created!");
      navigate(`/group/${g.id}`, { replace: true });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-gradient-primary text-primary-foreground px-3 py-3 flex items-center gap-3 shadow-soft">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate(-1)}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Users className="h-6 w-6" />
        <div className="flex-1">
          <h1 className="font-semibold">New Group</h1>
          <p className="text-xs text-primary-foreground/80">
            {selected.size} member{selected.size === 1 ? "" : "s"} selected
          </p>
        </div>
      </header>

      <div className="px-4 py-3 border-b">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name"
          className="h-11"
        />
      </div>

      <div className="flex-1 overflow-y-auto divide-y">
        {users.map((u) => {
          const on = selected.has(u.id);
          return (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 text-left"
            >
              <Avatar className="h-11 w-11">
                <AvatarImage src={u.photo_url ?? undefined} />
                <AvatarFallback className="bg-accent text-primary font-semibold">
                  {(u.name?.[0] || "?").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="flex-1 font-medium truncate">{u.name || "User"}</p>
              <span
                className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition ${
                  on
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/40"
                }`}
              >
                {on && <Check className="h-4 w-4" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t bg-background">
        <Button
          onClick={create}
          disabled={creating || !name.trim() || selected.size === 0}
          className="w-full h-11 bg-gradient-primary"
        >
          {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Group"}
        </Button>
      </div>
    </div>
  );
};

export default CreateGroup;
