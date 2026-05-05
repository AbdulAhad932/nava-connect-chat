import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Crown,
  Loader2,
  LogOut,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Group {
  id: string;
  name: string;
  photo_url: string | null;
  created_by: string;
}
interface Member {
  id: string;
  user_id: string;
  role: "admin" | "member";
  profile?: { name: string | null; photo_url: string | null };
}

const GroupInfo = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [adding, setAdding] = useState(false);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string | null; photo_url: string | null }[]>([]);
  const [ready, setReady] = useState(false);

  const me = members.find((m) => m.user_id === user?.id);
  const isAdmin = me?.role === "admin";

  const load = async () => {
    if (!groupId) return;
    const { data: g } = await supabase
      .from("groups")
      .select("*")
      .eq("id", groupId)
      .maybeSingle();
    setGroup(g as Group);

    const { data: rows } = await supabase
      .from("group_members")
      .select("id,user_id,role")
      .eq("group_id", groupId);
    const ids = (rows ?? []).map((r: any) => r.user_id);
    let profs: any[] = [];
    if (ids.length) {
      const { data } = await supabase
        .from("profiles")
        .select("id,name,photo_url")
        .in("id", ids);
      profs = data ?? [];
    }
    const merged: Member[] = (rows ?? []).map((r: any) => ({
      ...r,
      profile: profs.find((p: any) => p.id === r.user_id),
    }));
    setMembers(merged);
    setReady(true);
  };

  useEffect(() => {
    if (loading) return;
    if (!user) return navigate("/auth", { replace: true });
    load();
  }, [user, loading, groupId]);

  const openAdd = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id,name,photo_url")
      .order("name");
    const memberIds = new Set(members.map((m) => m.user_id));
    setAllUsers((data ?? []).filter((u: any) => !memberIds.has(u.id)));
    setAdding(true);
  };

  const addMember = async (uid: string) => {
    if (!groupId) return;
    const { error } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, user_id: uid, role: "member" });
    if (error) return toast.error(error.message);
    toast.success("Member added");
    setAdding(false);
    load();
  };

  const removeMember = async (memberRowId: string, uid: string) => {
    if (!confirm("Remove this member?")) return;
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("id", memberRowId);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    if (uid === user?.id) navigate("/");
    else load();
  };

  const promote = async (memberRowId: string) => {
    const { error } = await supabase
      .from("group_members")
      .update({ role: "admin" })
      .eq("id", memberRowId);
    if (error) return toast.error(error.message);
    load();
  };

  const deleteGroup = async () => {
    if (!group) return;
    if (!confirm("Delete this group for everyone?")) return;
    const { error } = await supabase.from("groups").delete().eq("id", group.id);
    if (error) return toast.error(error.message);
    toast.success("Group deleted");
    navigate("/");
  };

  if (loading || !ready || !group) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground px-3 py-3 flex items-center gap-3 shadow-soft">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate(-1)}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-semibold">Group Info</h1>
      </header>

      <div className="flex flex-col items-center py-6 border-b">
        <Avatar className="h-24 w-24">
          <AvatarImage src={group.photo_url ?? undefined} />
          <AvatarFallback className="bg-accent text-primary text-3xl font-bold">
            {group.name[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h2 className="mt-3 text-xl font-bold">{group.name}</h2>
        <p className="text-sm text-muted-foreground">
          {members.length} member{members.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="px-4 py-3 flex items-center justify-between">
        <h3 className="font-semibold">Members</h3>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={openAdd}>
            <UserPlus className="h-4 w-4 mr-1" /> Add
          </Button>
        )}
      </div>

      <div className="divide-y">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={m.profile?.photo_url ?? undefined} />
              <AvatarFallback className="bg-accent text-primary">
                {(m.profile?.name?.[0] || "?").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {m.profile?.name || "User"}
                {m.user_id === user?.id && (
                  <span className="text-xs text-muted-foreground ml-1">(You)</span>
                )}
              </p>
              {m.role === "admin" && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Crown className="h-3 w-3" /> Admin
                </p>
              )}
            </div>
            {isAdmin && m.user_id !== user?.id && (
              <div className="flex gap-1">
                {m.role !== "admin" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => promote(m.id)}
                    title="Make admin"
                  >
                    <Crown className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeMember(m.id, m.user_id)}
                  className="text-destructive"
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 py-6 space-y-2">
        <Button
          variant="outline"
          className="w-full text-destructive"
          onClick={() =>
            removeMember(me!.id, user!.id)
          }
          disabled={!me}
        >
          <LogOut className="h-4 w-4 mr-2" /> Leave Group
        </Button>
        {isAdmin && (
          <Button
            variant="destructive"
            className="w-full"
            onClick={deleteGroup}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete Group
          </Button>
        )}
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Members</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto divide-y">
            {allUsers.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">
                No more users to add
              </p>
            )}
            {allUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => addMember(u.id)}
                className="w-full flex items-center gap-3 py-2 hover:bg-muted/50 px-2 rounded text-left"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={u.photo_url ?? undefined} />
                  <AvatarFallback className="bg-accent text-primary">
                    {(u.name?.[0] || "?").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm">{u.name || "User"}</span>
                <Plus className="h-4 w-4 text-primary" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GroupInfo;
