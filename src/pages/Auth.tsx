import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { NavaLogo } from "@/components/NavaLogo";
import { toast } from "sonner";
import { Loader2, Phone } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const fullPhone = `+92${phone.replace(/^0+/, "")}`;

  const sendOtp = async () => {
    if (phone.length < 9) {
      toast.error("Sahi number daalein");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("OTP bhej diya gaya");
    setStep("otp");
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: fullPhone,
      token: otp,
      type: "sms",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome to NAVA");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col items-center">
        <NavaLogo size={96} className="mb-6" />
        <h1 className="text-4xl font-bold text-primary-foreground mb-2 tracking-tight">NAVA</h1>
        <p className="text-primary-foreground/80 mb-10 text-center">
          Voice • Chat • Connect
        </p>

        <div className="w-full bg-card rounded-3xl shadow-soft p-6 space-y-5">
          {step === "phone" ? (
            <>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">
                  Phone Number
                </h2>
                <p className="text-sm text-muted-foreground">
                  OTP code aap ke number pe ayega
                </p>
              </div>
              <div className="flex gap-2">
                <div className="flex items-center gap-1.5 bg-muted px-3 rounded-xl border border-border">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">+92</span>
                </div>
                <Input
                  type="tel"
                  inputMode="numeric"
                  placeholder="3001234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  className="h-12 text-base rounded-xl"
                />
              </div>
              <Button
                onClick={sendOtp}
                disabled={loading}
                className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-primary shadow-glow hover:opacity-90"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send OTP"}
              </Button>
            </>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">
                  Code Daalein
                </h2>
                <p className="text-sm text-muted-foreground">
                  6-digit code bheja gaya {fullPhone} pe
                </p>
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
                onClick={() => { setStep("phone"); setOtp(""); }}
                className="w-full text-sm text-primary font-medium"
              >
                Number badlein
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

export default Auth;
