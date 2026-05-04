import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { NavaLogo } from "@/components/NavaLogo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, MessageCircle } from "lucide-react";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.name) {
          navigate("/profile-setup", { replace: true });
          return;
        }
        setProfile(data);
        setChecking(false);
      });
  }, [user, loading, navigate]);

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-chat-bg">
      <header className="bg-gradient-primary text-primary-foreground px-5 py-4 flex items-center gap-3 shadow-soft">
        <NavaLogo size={40} />
        <div className="flex-1">
          <h1 className="text-xl font-bold">NAVA</h1>
          <p className="text-xs text-primary-foreground/80">Welcome, {profile?.name?.trim() || "User"}</p>
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

      <main className="px-6 py-16 flex flex-col items-center text-center max-w-sm mx-auto">
        <div className="h-20 w-20 rounded-3xl bg-accent flex items-center justify-center mb-6">
          <MessageCircle className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Chats jald aa rahi hain
        </h2>
        <p className="text-muted-foreground">
          Step 1 complete: Phone OTP login + Profile setup ho gaya hai. Next step mein hum chat list aur messages add karenge.
        </p>
      </main>
    </div>
  );
};

export default Index;
