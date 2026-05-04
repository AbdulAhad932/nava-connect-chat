import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NavaLogo } from "@/components/NavaLogo";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (password.length < 6) return toast.error("Password 6 characters ka ho");
    if (password !== confirm) return toast.error("Passwords match nahi karte");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password update ho gaya");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col items-center">
        <NavaLogo size={80} className="mb-6" />
        <div className="w-full bg-card rounded-3xl shadow-soft p-6 space-y-5">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-1">Naya Password</h2>
            <p className="text-sm text-muted-foreground">Apna naya password set karein</p>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="password"
              placeholder="Naya password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 pl-10 rounded-xl text-base"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-12 pl-10 rounded-xl text-base"
            />
          </div>
          <Button
            onClick={submit}
            disabled={loading}
            className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-primary shadow-glow hover:opacity-90"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Update Password"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
