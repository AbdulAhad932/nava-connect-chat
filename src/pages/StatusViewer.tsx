import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

interface Status {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
}
interface Profile {
  id: string;
  name: string | null;
  photo_url: string | null;
}

const STORY_DURATION_MS = 5000;

const StatusViewer = () => {
  const { userId } = useParams<{ userId: string }>();
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [userIds, setUserIds] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const list = (params.get("users") || "").split(",").filter(Boolean);
    setUserIds(list);
  }, [params]);

  useEffect(() => {
    if (loading) return;
    if (!user) return navigate("/auth", { replace: true });
    if (!userId) return;
    (async () => {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,name,photo_url")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("statuses")
          .select("*")
          .eq("user_id", userId)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: true }),
      ]);
      setProfile(p as Profile);
      setStatuses((s ?? []) as Status[]);
      setIdx(0);
      setProgress(0);
    })();
  }, [user, loading, userId, navigate]);

  const current = statuses[idx];

  const next = () => {
    if (idx < statuses.length - 1) {
      setIdx(idx + 1);
      setProgress(0);
    } else {
      // next user
      const i = userIds.indexOf(userId!);
      const nxt = userIds[i + 1];
      if (nxt) navigate(`/status/${nxt}?users=${userIds.join(",")}`, { replace: true });
      else navigate("/");
    }
  };
  const prev = () => {
    if (idx > 0) {
      setIdx(idx - 1);
      setProgress(0);
    } else {
      const i = userIds.indexOf(userId!);
      const pv = userIds[i - 1];
      if (pv) navigate(`/status/${pv}?users=${userIds.join(",")}`, { replace: true });
    }
  };

  useEffect(() => {
    if (!current || paused) return;
    if (current.media_type === "video") return; // video drives its own timing
    const interval = 50;
    const id = window.setInterval(() => {
      setProgress((p) => {
        const np = p + interval / STORY_DURATION_MS;
        if (np >= 1) {
          window.clearInterval(id);
          next();
          return 0;
        }
        return np;
      });
    }, interval);
    return () => window.clearInterval(id);
  }, [current, paused, idx]);

  if (loading || !current) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-primary-foreground">
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin" />
        ) : (
          <div className="text-center space-y-3">
            <p>No active stories</p>
            <Button variant="secondary" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="h-screen w-screen bg-black text-primary-foreground relative select-none"
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerCancel={() => setPaused(false)}
    >
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-2">
        {statuses.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 bg-white/30 rounded overflow-hidden">
            <div
              className="h-full bg-white transition-[width]"
              style={{
                width: `${i < idx ? 100 : i === idx ? progress * 100 : 0}%`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-3 left-0 right-0 z-20 flex items-center gap-2 px-3 pt-3">
        <Avatar className="h-8 w-8 border-2 border-white/40">
          <AvatarImage src={profile?.photo_url ?? undefined} />
          <AvatarFallback>{(profile?.name?.[0] || "?").toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{profile?.name || "User"}</p>
          <p className="text-[11px] opacity-80">
            {formatDistanceToNowStrict(new Date(current.created_at), {
              addSuffix: true,
            })}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate("/")}
          className="text-primary-foreground hover:bg-white/10 h-8 w-8"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Media */}
      <div className="h-full w-full flex items-center justify-center">
        {current.media_type === "image" ? (
          <img
            src={current.media_url}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <video
            src={current.media_url}
            autoPlay
            playsInline
            controls={false}
            onEnded={next}
            className="max-h-full max-w-full"
          />
        )}
      </div>

      {/* Caption */}
      {current.caption && (
        <div className="absolute bottom-12 left-0 right-0 px-4 z-20">
          <p className="text-center text-sm bg-black/40 inline-block px-3 py-1.5 rounded-full">
            {current.caption}
          </p>
        </div>
      )}

      {/* Tap zones */}
      <button
        onClick={prev}
        className="absolute top-12 left-0 bottom-0 w-1/3 z-10 flex items-center justify-start pl-2 opacity-0 hover:opacity-100"
      >
        <ChevronLeft className="h-8 w-8" />
      </button>
      <button
        onClick={next}
        className="absolute top-12 right-0 bottom-0 w-1/3 z-10 flex items-center justify-end pr-2 opacity-0 hover:opacity-100"
      >
        <ChevronRight className="h-8 w-8" />
      </button>
    </div>
  );
};

export default StatusViewer;
