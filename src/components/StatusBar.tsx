import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Status {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  created_at: string;
}
interface ProfileLite {
  id: string;
  name: string | null;
  photo_url: string | null;
}
interface Group {
  user: ProfileLite;
  count: number;
  latest: string;
}

export const StatusBar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [myStatuses, setMyStatuses] = useState<Status[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!user) return;
    const { data: statuses } = await supabase
      .from("statuses")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    const all = (statuses ?? []) as Status[];
    setMyStatuses(all.filter((s) => s.user_id === user.id));

    const userIds = Array.from(
      new Set(all.filter((s) => s.user_id !== user.id).map((s) => s.user_id))
    );
    if (userIds.length === 0) {
      setGroups([]);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,name,photo_url")
      .in("id", userIds);
    const profMap: Record<string, ProfileLite> = {};
    (profs ?? []).forEach((p: any) => (profMap[p.id] = p));
    const grp: Group[] = userIds.map((uid) => {
      const list = all.filter((s) => s.user_id === uid);
      return {
        user: profMap[uid] || { id: uid, name: "User", photo_url: null },
        count: list.length,
        latest: list[0].created_at,
      };
    });
    grp.sort((a, b) => (a.latest < b.latest ? 1 : -1));
    setGroups(grp);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("statuses-bar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "statuses" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !user) return;
    const isImage = f.type.startsWith("image/");
    const isVideo = f.type.startsWith("video/");
    if (!isImage && !isVideo) return toast.error("Image or video only");
    if (isVideo) {
      try {
        const url = URL.createObjectURL(f);
        const dur = await new Promise<number>((resolve, reject) => {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.onloadedmetadata = () => resolve(v.duration);
          v.onerror = reject;
          v.src = url;
        });
        URL.revokeObjectURL(url);
        if (dur > 30.5) return toast.error("Video must be 30s or less");
      } catch {}
    }
    setUploading(true);
    try {
      const ext = f.name.includes(".") ? f.name.split(".").pop() : isImage ? "jpg" : "mp4";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("status-media")
        .upload(path, f, { contentType: f.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("status-media").getPublicUrl(path);
      const { error: insErr } = await supabase.from("statuses").insert({
        user_id: user.id,
        media_url: pub.publicUrl,
        media_type: isImage ? "image" : "video",
      });
      if (insErr) throw insErr;
      toast.success("Status posted!");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;
  const userIdsForViewer = [
    ...(myStatuses.length ? [user.id] : []),
    ...groups.map((g) => g.user.id),
  ];

  const openMine = () => {
    if (myStatuses.length === 0) return fileRef.current?.click();
    navigate(`/status/${user.id}?users=${userIdsForViewer.join(",")}`);
  };
  const openOther = (uid: string) => {
    navigate(`/status/${uid}?users=${userIdsForViewer.join(",")}`);
  };

  return (
    <div className="px-4 py-3 bg-background border-b overflow-x-auto">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={onPick}
      />
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <button
            onClick={openMine}
            className={`relative h-14 w-14 rounded-full p-[2px] ${
              myStatuses.length
                ? "bg-gradient-primary"
                : "bg-muted"
            }`}
          >
            <Avatar className="h-full w-full border-2 border-background">
              <AvatarFallback className="bg-accent text-primary text-sm font-semibold">
                You
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center border-2 border-background">
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </span>
          </button>
          <span className="text-[11px] text-muted-foreground">My status</span>
        </div>

        {groups.map((g) => (
          <button
            key={g.user.id}
            onClick={() => openOther(g.user.id)}
            className="flex flex-col items-center gap-1 shrink-0"
          >
            <div className="h-14 w-14 rounded-full p-[2px] bg-gradient-primary">
              <Avatar className="h-full w-full border-2 border-background">
                <AvatarImage src={g.user.photo_url ?? undefined} />
                <AvatarFallback className="bg-accent text-primary text-sm font-semibold">
                  {(g.user.name?.[0] || "?").toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <span className="text-[11px] text-foreground/80 truncate max-w-[60px]">
              {g.user.name || "User"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
