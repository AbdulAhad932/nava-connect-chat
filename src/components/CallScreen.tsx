import { useEffect, useRef, useState } from "react";
import { useCall } from "@/contexts/CallContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

export const CallScreen = () => {
  const call = useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (localVideoRef.current && call.localStream) {
      localVideoRef.current.srcObject = call.localStream;
    }
  }, [call.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && call.remoteStream) {
      remoteVideoRef.current.srcObject = call.remoteStream;
    }
    if (remoteAudioRef.current && call.remoteStream) {
      remoteAudioRef.current.srcObject = call.remoteStream;
      remoteAudioRef.current.muted = !call.speakerOn;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [call.remoteStream, call.speakerOn]);

  useEffect(() => {
    if (call.phase !== "active" || !call.startedAt) return;
    const t = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - (call.startedAt ?? Date.now())) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [call.phase, call.startedAt]);

  if (call.phase === "idle") return null;

  const isVideo = call.callType === "video" && !call.videoOff;
  const statusText =
    call.phase === "incoming"
      ? `Incoming ${call.callType} call...`
      : call.phase === "outgoing"
      ? "Calling..."
      : call.phase === "active"
      ? fmt(elapsed)
      : call.phase === "ended"
      ? "Call ended"
      : "";

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-slate-900 to-slate-950 text-white flex flex-col">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {isVideo && call.remoteStream ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : null}

      {isVideo && call.localStream ? (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-6 right-4 w-28 h-40 rounded-xl object-cover border border-white/30 shadow-lg z-10"
        />
      ) : null}

      <div className="relative flex-1 flex flex-col items-center justify-center text-center px-6 gap-4">
        {!isVideo && (
          <>
            <Avatar className="h-32 w-32 border-4 border-white/20 shadow-xl">
              <AvatarImage src={call.peer?.photo_url ?? undefined} />
              <AvatarFallback className="bg-primary/30 text-3xl">
                {(call.peer?.name?.[0] || "?").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-semibold">{call.peer?.name || "User"}</h2>
            <p className="text-white/70">{statusText}</p>
          </>
        )}
        {isVideo && (
          <div className="absolute top-6 left-4">
            <p className="font-semibold">{call.peer?.name || "User"}</p>
            <p className="text-xs text-white/70">{statusText}</p>
          </div>
        )}
      </div>

      <div className="relative pb-10 pt-4 px-6 flex items-center justify-center gap-4">
        {call.phase === "incoming" ? (
          <>
            <Button
              size="icon"
              onClick={call.declineCall}
              className="h-16 w-16 rounded-full bg-destructive hover:bg-destructive/90"
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
            <Button
              size="icon"
              onClick={call.acceptCall}
              className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600"
            >
              <Phone className="h-7 w-7" />
            </Button>
          </>
        ) : (
          <>
            <Button
              size="icon"
              variant="ghost"
              onClick={call.toggleMute}
              className="h-14 w-14 rounded-full bg-white/10 hover:bg-white/20 text-white"
            >
              {call.muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>
            {call.callType === "video" && (
              <Button
                size="icon"
                variant="ghost"
                onClick={call.toggleVideo}
                className="h-14 w-14 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                {call.videoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={call.toggleSpeaker}
              className="h-14 w-14 rounded-full bg-white/10 hover:bg-white/20 text-white"
            >
              {call.speakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
            </Button>
            <Button
              size="icon"
              onClick={call.endCall}
              className="h-16 w-16 rounded-full bg-destructive hover:bg-destructive/90"
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
