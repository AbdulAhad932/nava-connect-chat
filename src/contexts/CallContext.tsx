import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type CallType = "audio" | "video";
export type CallPhase = "idle" | "outgoing" | "incoming" | "active" | "ended";

interface PeerProfile {
  id: string;
  name: string | null;
  photo_url: string | null;
}

interface CallState {
  phase: CallPhase;
  callId: string | null;
  callType: CallType;
  peer: PeerProfile | null;
  iAmCaller: boolean;
  muted: boolean;
  videoOff: boolean;
  speakerOn: boolean;
  startedAt: number | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

interface CallContextValue extends CallState {
  startCall: (peer: PeerProfile, type: CallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const initial: CallState = {
  phase: "idle",
  callId: null,
  callType: "audio",
  peer: null,
  iAmCaller: false,
  muted: false,
  videoOff: false,
  speakerOn: true,
  startedAt: null,
  localStream: null,
  remoteStream: null,
};

export const CallProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [state, setState] = useState<CallState>(initial);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sigChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  const cleanup = useCallback(() => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    if (sigChannelRef.current) {
      supabase.removeChannel(sigChannelRef.current);
      sigChannelRef.current = null;
    }
    stateRef.current.localStream?.getTracks().forEach((t) => t.stop());
    pendingIceRef.current = [];
  }, []);

  const sendSignal = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      sigChannelRef.current?.send({
        type: "broadcast",
        event,
        payload: { ...payload, from: user?.id },
      });
    },
    [user?.id]
  );

  const setupPeer = useCallback(
    (callId: string, peerId: string, callType: CallType) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal("ice", { callId, to: peerId, candidate: e.candidate.toJSON() });
        }
      };

      const remote = new MediaStream();
      pc.ontrack = (e) => {
        e.streams[0].getTracks().forEach((t) => remote.addTrack(t));
        setState((s) => ({ ...s, remoteStream: remote }));
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected" ||
          pc.connectionState === "closed"
        ) {
          if (stateRef.current.phase === "active") {
            void endCallInternal("ended");
          }
        }
      };

      return pc;
    },
    [sendSignal]
  );

  const subscribeSignaling = useCallback(
    (callId: string, peerId: string, callType: CallType, onReady?: () => void) => {
      const ch = supabase.channel(`call:${callId}`, {
        config: { broadcast: { self: false } },
      });

      ch.on("broadcast", { event: "offer" }, async (msg: any) => {
        const { sdp } = msg.payload || {};
        if (!sdp || !pcRef.current) return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        for (const c of pendingIceRef.current) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
          } catch {}
        }
        pendingIceRef.current = [];
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        sendSignal("answer", { callId, to: peerId, sdp: pcRef.current.localDescription });
      });

      ch.on("broadcast", { event: "answer" }, async (msg: any) => {
        const { sdp } = msg.payload || {};
        if (!sdp || !pcRef.current) return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        setState((s) => ({ ...s, phase: "active", startedAt: Date.now() }));
        await supabase
          .from("call_history")
          .update({ status: "ongoing" })
          .eq("id", callId);
      });

      ch.on("broadcast", { event: "ice" }, async (msg: any) => {
        const { candidate } = msg.payload || {};
        if (!candidate) return;
        if (pcRef.current?.remoteDescription) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {}
        } else {
          pendingIceRef.current.push(candidate);
        }
      });

      ch.on("broadcast", { event: "hangup" }, () => {
        void endCallInternal("ended", true);
      });

      ch.on("broadcast", { event: "decline" }, () => {
        toast.info("Call declined");
        void endCallInternal("declined", true);
      });

      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") onReady?.();
      });

      sigChannelRef.current = ch;
    },
    [sendSignal]
  );

  const endCallInternal = useCallback(
    async (status: "ended" | "missed" | "declined" | "failed", remote = false) => {
      const cur = stateRef.current;
      if (cur.callId && !remote) {
        sendSignal(status === "declined" ? "decline" : "hangup", { callId: cur.callId });
      }
      if (cur.callId) {
        const duration = cur.startedAt
          ? Math.round((Date.now() - cur.startedAt) / 1000)
          : 0;
        await supabase
          .from("call_history")
          .update({
            status,
            ended_at: new Date().toISOString(),
            duration_seconds: duration,
          })
          .eq("id", cur.callId);
      }
      cleanup();
      setState({ ...initial, phase: "ended" });
      setTimeout(() => setState(initial), 1500);
    },
    [cleanup, sendSignal]
  );

  // Listen for incoming calls targeted at me
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`incoming-calls:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_history",
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload) => {
          const row: any = payload.new;
          if (row.status !== "ringing") return;
          if (stateRef.current.phase !== "idle") {
            // Auto-decline if busy
            await supabase
              .from("call_history")
              .update({ status: "declined", ended_at: new Date().toISOString() })
              .eq("id", row.id);
            return;
          }
          const { data: caller } = await supabase
            .from("profiles")
            .select("id,name,photo_url")
            .eq("id", row.caller_id)
            .maybeSingle();
          setState({
            ...initial,
            phase: "incoming",
            callId: row.id,
            callType: row.call_type,
            iAmCaller: false,
            peer: (caller as PeerProfile) ?? { id: row.caller_id, name: null, photo_url: null },
          });
          setupPeer(row.id, row.caller_id, row.call_type);
          subscribeSignaling(row.id, row.caller_id, row.call_type);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, setupPeer, subscribeSignaling]);

  const startCall = async (peer: PeerProfile, type: CallType) => {
    if (!user) return;
    if (stateRef.current.phase !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "video",
      });
      const { data: row, error } = await supabase
        .from("call_history")
        .insert({
          caller_id: user.id,
          callee_id: peer.id,
          call_type: type,
          status: "ringing",
        })
        .select()
        .single();
      if (error || !row) {
        stream.getTracks().forEach((t) => t.stop());
        toast.error("Could not start call");
        return;
      }
      setState({
        ...initial,
        phase: "outgoing",
        callId: row.id,
        callType: type,
        peer,
        iAmCaller: true,
        localStream: stream,
        videoOff: type !== "video",
      });
      const pc = setupPeer(row.id, peer.id, type);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      subscribeSignaling(row.id, peer.id, type, async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal("offer", { callId: row.id, to: peer.id, sdp: pc.localDescription });
      });

      // Auto-miss after 35s if no answer
      setTimeout(() => {
        if (
          stateRef.current.phase === "outgoing" &&
          stateRef.current.callId === row.id
        ) {
          void endCallInternal("missed");
          toast.info("No answer");
        }
      }, 35000);
    } catch (e: any) {
      toast.error(e?.message || "Microphone/camera permission denied");
    }
  };

  const acceptCall = async () => {
    const cur = stateRef.current;
    if (!cur.callId || !cur.peer || cur.phase !== "incoming") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: cur.callType === "video",
      });
      stream.getTracks().forEach((t) => pcRef.current?.addTrack(t, stream));
      setState((s) => ({
        ...s,
        localStream: stream,
        videoOff: cur.callType !== "video",
      }));
    } catch (e: any) {
      toast.error("Permission denied");
      void endCallInternal("failed");
    }
  };

  const declineCall = async () => {
    await endCallInternal("declined");
  };

  const endCall = async () => {
    await endCallInternal("ended");
  };

  const toggleMute = () => {
    const cur = stateRef.current;
    cur.localStream?.getAudioTracks().forEach((t) => (t.enabled = cur.muted));
    setState((s) => ({ ...s, muted: !s.muted }));
  };
  const toggleVideo = () => {
    const cur = stateRef.current;
    cur.localStream?.getVideoTracks().forEach((t) => (t.enabled = cur.videoOff));
    setState((s) => ({ ...s, videoOff: !s.videoOff }));
  };
  const toggleSpeaker = () => {
    setState((s) => ({ ...s, speakerOn: !s.speakerOn }));
  };

  return (
    <CallContext.Provider
      value={{
        ...state,
        startCall,
        acceptCall,
        declineCall,
        endCall,
        toggleMute,
        toggleVideo,
        toggleSpeaker,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
};
