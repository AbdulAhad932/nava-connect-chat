import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalPresence } from "@/hooks/usePresence";
import { NavaLogo } from "@/components/NavaLogo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, LogOut, MessageSquarePlus, Search, Users } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { StatusBar } from "@/components/StatusBar";

interface Profile {
  id: string;
  name: string | null;
  photo_url: string | null;
  is_online: boolean;
  last_seen: string;
}

interface ChatRow {
  user: Profile;
  lastMessage?: string;
  lastAt?: string;
  unread: number;
}

interface GroupRow {
  id: string;
  name: string;
  photo_url: string | null;
  lastMessage?: string;
  lastAt?: string;
}

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [chats, setChats] = useState<Record<string, ChatRow>>({});
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [search, setSearch] = useState("");
  const [checking, setChecking] = useState(true);
  const onlineSet = useGlobalPresence(user?.id);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    (async () => {
      const { data: me } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (!me?.name) {
        navigate("/profile-setup", { replace: true });
        return;
      }
      setProfile(me as Profile);

      const { data: others } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", user.id)
        .order("name");
      setUsers((others ?? []) as Profile[]);

      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      const map: Record<string, ChatRow> = {};
      (others ?? []).forEach((u: any) => {
        map[u.id] = { user: u, unread: 0 };
      });
      const preview = (m: any) =>
        m.media_type === "image"
          ? "📷 Photo"
          : m.media_type === "document"
            ? `📎 ${m.media_name ?? "Document"}`
            : m.media_type === "voice"
              ? "🎤 Voice message"
              : m.message ?? "";
      (msgs ?? []).forEach((m: any) => {
        const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        if (!map[otherId]) return;
        if (!map[otherId].lastMessage) {
          map[otherId].lastMessage = preview(m);
          map[otherId].lastAt = m.created_at;
        }
        if (m.receiver_id === user.id && !m.is_read) {
          map[otherId].unread += 1;
        }
      });
      setChats(map);

      // Groups list
      const { data: gms } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);
      const gids = (gms ?? []).map((r: any) => r.group_id);
      if (gids.length) {
        const { data: gs } = await supabase
          .from("groups")
          .select("id,name,photo_url")
          .in("id", gids);
        const { data: gmsg } = await supabase
          .from("messages")
          .select("group_id,message,media_type,media_name,created_at")
          .in("group_id", gids)
          .order("created_at", { ascending: false });
        const gmap: Record<string, { msg: string; at: string }> = {};
        (gmsg ?? []).forEach((m: any) => {
          if (gmap[m.group_id]) return;
          gmap[m.group_id] = {
            msg:
              m.media_type === "image"
                ? "📷 Photo"
                : m.media_type === "document"
                  ? `📎 ${m.media_name ?? "Document"}`
                  : m.media_type === "voice"
                    ? "🎤 Voice"
                    : m.message ?? "",
            at: m.created_at,
          };
        });
        setGroups(
          ((gs ?? []) as any[]).map((g) => ({
            id: g.id,
            name: g.name,
            photo_url: g.photo_url,
            lastMessage: gmap[g.id]?.msg,
            lastAt: gmap[g.id]?.at,
          }))
        );
      } else {
        setGroups([]);
      }
      setChecking(false);
    })();
  }, [user, loading, navigate]);

  // Realtime: refresh chat list on new messages + read updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("messages-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m: any = payload.new;
          if (m.sender_id !== user.id && m.receiver_id !== user.id) return;
          const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
          setChats((prev) => {
            const row = prev[otherId];
            if (!row) return prev;
            return {
              ...prev,
              [otherId]: {
                ...row,
                lastMessage:
                  m.media_type === "image"
                    ? "📷 Photo"
                    : m.media_type === "document"
                      ? `📎 ${m.media_name ?? "Document"}`
                      : m.media_type === "voice"
                        ? "🎤 Voice message"
                        : m.message ?? "",
                lastAt: m.created_at,
                unread:
                  m.receiver_id === user.id ? row.unread + 1 : row.unread,
              },
            };
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m: any = payload.new;
          const old: any = payload.old;
          // when receiver marks as read, we (sender) don't need to change unread
          // but if the user themselves is the receiver and message becomes read, decrement
          if (m.receiver_id !== user.id) return;
          if (old?.is_read === false && m.is_read === true) {
            const otherId = m.sender_id;
            setChats((prev) => {
              const row = prev[otherId];
              if (!row || row.unread <= 0) return prev;
              return { ...prev, [otherId]: { ...row, unread: row.unread - 1 } };
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading || checking || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const sorted = users
    .filter((u) => (u.name ?? "").toLowerCase().includes(q))
    .map((u) => chats[u.id])
    .filter(Boolean)
    .sort((a, b) => {
      if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
      if (a.lastAt) return -1;
      if (b.lastAt) return 1;
      return (a.user.name ?? "").localeCompare(b.user.name ?? "");
    });

  return (
    <div className="min-h-screen bg-chat-bg">
      <header className="bg-gradient-primary text-primary-foreground px-5 py-4 flex items-center gap-3 shadow-soft sticky top-0 z-10">
        <NavaLogo size={40} />
        <div className="flex-1">
          <h1 className="text-xl font-bold">NAVA</h1>
          <p className="text-xs text-primary-foreground/80">
            Welcome, {profile?.name?.trim() || "User"}
          </p>
        </div>
        <Avatar className="h-10 w-10 border-2 border-primary-foreground/30">
          <AvatarImage src={profile.photo_url ?? undefined} />
          <AvatarFallback className="bg-primary-dark text-primary-foreground">
            {(profile?.name?.trim()?.[0] || "U").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <Button
          size="icon"
          variant="ghost"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate("/auth");
          }}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <StatusBar />

      <div className="px-4 py-3 bg-background border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name..."
            className="pl-9 h-10 rounded-xl"
          />
        </div>
      </div>

      <main className="divide-y pb-24">
        {groups
          .filter((g) => g.name.toLowerCase().includes(q))
          .sort((a, b) => {
            if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
            if (a.lastAt) return -1;
            if (b.lastAt) return 1;
            return a.name.localeCompare(b.name);
          })
          .map((g) => (
            <button
              key={g.id}
              onClick={() => navigate(`/group/${g.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/50 transition text-left"
            >
              <Avatar className="h-12 w-12">
                <AvatarImage src={g.photo_url ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Users className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold truncate">{g.name}</p>
                  {g.lastAt && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNowStrict(new Date(g.lastAt), {
                        addSuffix: false,
                      })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {g.lastMessage || "Group created"}
                </p>
              </div>
            </button>
          ))}

        {sorted.length === 0 && groups.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            Koi user nahi mila
          </div>
        )}
        {sorted.map((row) => {
          const isOnline = onlineSet.has(row.user.id);
          return (
            <button
              key={row.user.id}
              onClick={() => navigate(`/chat/${row.user.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/50 transition text-left"
            >
              <div className="relative">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={row.user.photo_url ?? undefined} />
                  <AvatarFallback className="bg-accent text-primary font-semibold">
                    {(row.user.name?.[0] || "?").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {isOnline && (
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground truncate">
                    {row.user.name || "User"}
                  </p>
                  {row.lastAt && (
                    <span
                      className={`text-xs shrink-0 ${
                        row.unread > 0
                          ? "text-primary font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatDistanceToNowStrict(new Date(row.lastAt), {
                        addSuffix: false,
                      })}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-sm text-muted-foreground truncate">
                    {row.lastMessage || "Tap to start chat"}
                  </p>
                  {row.unread > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center">
                      {row.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </main>

      <Button
        onClick={() => navigate("/new-group")}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-gradient-primary shadow-glow z-20"
        size="icon"
      >
        <MessageSquarePlus className="h-6 w-6" />
      </Button>
    </div>
  );
};

export default Index;
