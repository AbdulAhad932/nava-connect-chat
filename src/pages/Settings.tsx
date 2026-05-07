import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  Loader2,
  Moon,
  Shield,
  Sun,
  UserX,
} from "lucide-react";

interface Profile {
  id: string;
  name: string | null;
  about: string | null;
  photo_url: string | null;
  privacy_last_seen: string;
  privacy_photo: string;
  privacy_about: string;
}

interface BlockedRow {
  id: string;
  blocked_id: string;
  profile?: { name: string | null; photo_url: string | null };
}

const PRIVACY_OPTS = [
  { value: "everyone", label: "Everyone" },
  { value: "contacts", label: "My Contacts" },
  { value: "nobody", label: "Nobody" },
];

// Center-square crop helper -> returns Blob
async function cropToSquare(file: File, size = 512): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9)
  );
}

const Settings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState<BlockedRow[]>([]);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setProfile(data as Profile);
        setName(data.name ?? "");
        setAbout((data as any).about ?? "");
        setPhotoUrl(data.photo_url);
      }
      const { data: blocks } = await supabase
        .from("blocked_users")
        .select("id, blocked_id")
        .eq("blocker_id", user.id);
      if (blocks?.length) {
        const ids = blocks.map((b: any) => b.blocked_id);
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,name,photo_url")
          .in("id", ids);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
        setBlocked(
          blocks.map((b: any) => ({ ...b, profile: map.get(b.blocked_id) }))
        );
      }
    })();
  }, [user, navigate]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8MB");
      return;
    }
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setCropOpen(true);
  };

  const confirmCrop = async () => {
    if (!pendingFile || !user) return;
    setUploading(true);
    try {
      const blob = await cropToSquare(pendingFile);
      const path = `${user.id}/avatar.jpg`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      setPhotoUrl(url);
      setCropOpen(false);
      toast.success("Photo updated");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!user || !profile) return;
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: name.trim(),
        about: about.trim(),
        photo_url: photoUrl,
        privacy_last_seen: profile.privacy_last_seen,
        privacy_photo: profile.privacy_photo,
        privacy_about: profile.privacy_about,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
  };

  const unblock = async (id: string) => {
    const { error } = await supabase.from("blocked_users").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setBlocked((prev) => prev.filter((b) => b.id !== id));
    toast.success("Unblocked");
  };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <div className="max-w-md mx-auto px-5 py-6 space-y-8">
        {/* DP */}
        <div className="flex flex-col items-center">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative group"
            disabled={uploading}
          >
            <Avatar className="h-28 w-28 border-4 border-primary/20 shadow-soft">
              <AvatarImage src={photoUrl ?? undefined} />
              <AvatarFallback className="bg-muted text-3xl">
                {(name?.[0] ?? "?").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 h-9 w-9 rounded-full bg-gradient-primary flex items-center justify-center border-4 border-background shadow-glow">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
              ) : (
                <Camera className="h-4 w-4 text-primary-foreground" />
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="hidden"
            />
          </button>
          <p className="text-xs text-muted-foreground mt-2">Tap to change photo</p>
        </div>

        {/* Name + About */}
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 50))}
              className="mt-1.5 h-11 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">About</Label>
            <Textarea
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, 140))}
              className="mt-1.5 rounded-xl resize-none"
              rows={3}
              placeholder="Hey there! I am using NAVA."
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {about.length}/140
            </p>
          </div>
        </div>

        {/* Theme */}
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="h-5 w-5 text-primary" />
              ) : (
                <Sun className="h-5 w-5 text-primary" />
              )}
              <div>
                <p className="font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground">
                  Switch theme appearance
                </p>
              </div>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(c) => setTheme(c ? "dark" : "light")}
            />
          </div>
        </div>

        {/* Privacy */}
        <div className="rounded-2xl border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Privacy</h2>
          </div>
          {(
            [
              ["privacy_last_seen", "Last Seen"],
              ["privacy_photo", "Profile Photo"],
              ["privacy_about", "About"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <Label className="text-sm">{label}</Label>
              <Select
                value={(profile as any)[key]}
                onValueChange={(v) =>
                  setProfile({ ...profile, [key]: v } as Profile)
                }
              >
                <SelectTrigger className="w-40 h-9 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIVACY_OPTS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {/* Blocked Users */}
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <UserX className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Blocked Users</h2>
          </div>
          {blocked.length === 0 ? (
            <p className="text-sm text-muted-foreground">No blocked users</p>
          ) : (
            <div className="space-y-2">
              {blocked.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={b.profile?.photo_url ?? undefined} />
                    <AvatarFallback>
                      {(b.profile?.name?.[0] ?? "?").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm font-medium truncate">
                    {b.profile?.name ?? "User"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unblock(b.id)}
                  >
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button
          onClick={save}
          disabled={saving}
          className="w-full h-12 rounded-xl bg-gradient-primary shadow-glow"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Changes"}
        </Button>
      </div>

      {/* Crop Dialog */}
      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Crop Photo</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="flex justify-center">
              <div className="relative h-64 w-64 rounded-full overflow-hidden border-4 border-primary/30 bg-muted">
                <img
                  src={previewUrl}
                  alt="preview"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Image will be center-cropped to a square
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCropOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmCrop} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
