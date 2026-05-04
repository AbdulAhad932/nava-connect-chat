import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { NavaLogo } from "@/components/NavaLogo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, LogOut, Search } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

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

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [chats, setChats] = useState<Record<string, ChatRow>>({});
  const [search, setSearch] = useState("");
  const [checking, setChecking] = useState(true);

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
      (msgs ?? []).forEach((m: any) => {
        const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        if (!map[otherId]) return;
        if (!map[otherId].lastMessage) {
          map[otherId].lastMessage = m.message;
          map[otherId].lastAt = m.created_at;
        }
        if (m.receiver_id === user.id && !m.is_read) {
          map[otherId].unread += 1;
        }
      });
      setChats(map);
      setChecking(false);
    })();
  }, [user, loading, navigate]);

  // Realtime: refresh chat list on new messages
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
                lastMessage: m.message,
                lastAt: m.created_at,
                unread:
                  m.receiver_id === user.id ? row.unread + 1 : row.unread,
              },
            };
          });
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

  const sorted = users
    .filter((u) =>
      (u.name ?? "").toLowerCase().includes(search.toLowerCase())
    )
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

      <div className="px-4 py-3 bg-background border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="pl-9 h-10 rounded-xl"
          />
        </div>
      </div>

      <main className="divide-y">
        {sorted.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            Koi user nahi mila
          </div>
        )}
        {sorted.map((row) => (
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
              {row.user.is_online && (
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-foreground truncate">
                  {row.user.name || "User"}
                </p>
                {row.lastAt && (
                  <span className="text-xs text-muted-foreground shrink-0">
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
        ))}
      </main>
    </div>
  );
};

export default Index;
