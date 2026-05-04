import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";

const ProfileSetup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo 5MB se kam honi chahiye");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setPhotoUrl(`${data.publicUrl}?t=${Date.now()}`);
    setUploading(false);
  };

  const save = async () => {
    if (!name.trim() || !user) {
      toast.error("Apna naam likhein");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim(), photo_url: photoUrl, is_online: true })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile save ho gayi");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 py-10">
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col">
        <h1 className="text-3xl font-bold text-foreground">Profile Banayein</h1>
        <p className="text-muted-foreground mt-2 mb-10">
          Apna naam aur photo set karein
        </p>

        <div className="flex justify-center mb-10">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative group"
            disabled={uploading}
          >
            <Avatar className="h-32 w-32 border-4 border-primary/20 shadow-soft">
              <AvatarImage src={photoUrl ?? undefined} />
              <AvatarFallback className="bg-muted text-3xl">
                {name ? name[0].toUpperCase() : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 h-10 w-10 rounded-full bg-gradient-primary flex items-center justify-center shadow-glow border-4 border-background">
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
              onChange={handlePhoto}
              className="hidden"
            />
          </button>
        </div>

        <label className="text-sm font-medium text-foreground mb-2">Naam</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 50))}
          placeholder="Aap ka naam"
          className="h-12 rounded-xl text-base"
        />

        <Button
          onClick={save}
          disabled={saving || !name.trim()}
          className="mt-auto h-12 rounded-xl text-base font-semibold bg-gradient-primary shadow-glow hover:opacity-90"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
        </Button>
      </div>
    </div>
  );
};

export default ProfileSetup;
