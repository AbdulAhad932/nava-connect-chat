import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { NavaLogo } from "@/components/NavaLogo";
import { toast } from "sonner";
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";

type Mode = "login" | "signup" | "otp" | "forgot";

const Auth = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (mode !== "otp" || resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [mode, resendIn]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const signUp = async () => {
    if (!validEmail) return toast.error("Sahi email daalein");
    if (password.length < 6) return toast.error("Password 6 characters ka ho");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("OTP email pe bheja gaya");
    setMode("otp");
    setResendIn(45);
  };

  const login = async () => {
    if (!validEmail || !password) return toast.error("Email aur password daalein");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      if (error.message.toLowerCase().includes("not confirmed")) {
        toast.error("Pehle email verify karein");
        setMode("otp");
        setResendIn(0);
        return;
      }
      return toast.error(error.message);
    }
    toast.success("Welcome to NAVA");
    navigate("/");
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Email verify ho gaya");
    navigate("/");
  };

  const resendOtp = async () => {
    if (resendIn > 0) return;
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Naya OTP bhej diya");
    setResendIn(45);
  };

  const forgot = async () => {
    if (!validEmail) return toast.error("Sahi email daalein");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Reset link email pe bheja gaya");
    setMode("login");
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col items-center">
        <NavaLogo size={96} className="mb-6" />
        <h1 className="text-4xl font-bold text-primary-foreground mb-2 tracking-tight">NAVA</h1>
        <p className="text-primary-foreground/80 mb-10 text-center">Voice • Chat • Connect</p>

        <div className="w-full bg-card rounded-3xl shadow-soft p-6 space-y-5">
          {mode === "login" && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">Login</h2>
                <p className="text-sm text-muted-foreground">Apne account mein wapas aayein</p>
              </div>
              <EmailField value={email} onChange={setEmail} />
              <PasswordField value={password} onChange={setPassword} show={showPw} setShow={setShowPw} />
              <button
                onClick={() => setMode("forgot")}
                className="text-sm text-primary font-medium block ml-auto"
              >
                Forgot Password?
              </button>
              <Button
                onClick={login}
                disabled={loading}
                className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-primary shadow-glow hover:opacity-90"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Login"}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                Naya user?{" "}
                <button onClick={() => setMode("signup")} className="text-primary font-semibold">
                  Sign Up
                </button>
              </p>
            </>
          )}

          {mode === "signup" && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">Sign Up</h2>
                <p className="text-sm text-muted-foreground">Naya account banayein</p>
              </div>
              <EmailField value={email} onChange={setEmail} />
              <PasswordField value={password} onChange={setPassword} show={showPw} setShow={setShowPw} />
              <Button
                onClick={signUp}
                disabled={loading}
                className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-primary shadow-glow hover:opacity-90"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign Up"}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                Pehle se account hai?{" "}
                <button onClick={() => setMode("login")} className="text-primary font-semibold">
                  Login
                </button>
              </p>
            </>
          )}

          {mode === "otp" && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">Code Daalein</h2>
                <p className="text-sm text-muted-foreground">6-digit code bheja gaya {email} pe</p>
              </div>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button
                onClick={verifyOtp}
                disabled={loading || otp.length !== 6}
                className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-primary shadow-glow hover:opacity-90"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify & Continue"}
              </Button>
              <button
                onClick={resendOtp}
                disabled={resendIn > 0 || loading}
                className="w-full text-sm text-primary font-medium disabled:text-muted-foreground"
              >
                {resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend OTP"}
              </button>
              <button
                onClick={() => { setMode("login"); setOtp(""); }}
                className="w-full text-xs text-muted-foreground"
              >
                Wapas Login pe jayein
              </button>
            </>
          )}

          {mode === "forgot" && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">Forgot Password</h2>
                <p className="text-sm text-muted-foreground">Reset link aap ke email pe ayega</p>
              </div>
              <EmailField value={email} onChange={setEmail} />
              <Button
                onClick={forgot}
                disabled={loading}
                className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-primary shadow-glow hover:opacity-90"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send Reset Link"}
              </Button>
              <button
                onClick={() => setMode("login")}
                className="w-full text-sm text-primary font-medium"
              >
                Wapas Login pe jayein
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-primary-foreground/70 mt-6 text-center px-4">
          Continue karne se aap NAVA ke Terms aur Privacy se ittefaq karte hain
        </p>
      </div>
    </div>
  );
};

const EmailField = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <div className="relative">
    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <Input
      type="email"
      inputMode="email"
      autoComplete="email"
      placeholder="aap@example.com"
      value={value}
      onChange={(e) => onChange(e.target.value.trim())}
      className="h-12 pl-10 rounded-xl text-base"
    />
  </div>
);

const PasswordField = ({
  value, onChange, show, setShow,
}: { value: string; onChange: (v: string) => void; show: boolean; setShow: (v: boolean) => void }) => (
  <div className="relative">
    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <Input
      type={show ? "text" : "password"}
      autoComplete="current-password"
      placeholder="Password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-12 pl-10 pr-10 rounded-xl text-base"
    />
    <button
      type="button"
      onClick={() => setShow(!show)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  </div>
);

export default Auth;
