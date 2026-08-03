import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, SwitchCamera } from "lucide-react";

export type CallKind = "audio" | "video";
export type CallState =
  | { status: "idle" }
  | { status: "outgoing"; kind: CallKind; to: string }
  | { status: "incoming"; kind: CallKind; from: string; offer: RTCSessionDescriptionInit }
  | { status: "in-call"; kind: CallKind; peer: string };

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

type SignalPayload =
  | { type: "call-request"; from: string; to: string; kind: CallKind; offer: RTCSessionDescriptionInit }
  | { type: "call-accept"; from: string; to: string; answer: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: "call-end"; from: string; to: string }
  | { type: "call-decline"; from: string; to: string };

export function CallOverlay({
  userId,
  otherId,
  otherName,
  callState,
  setCallState,
}: {
  userId: string;
  otherId: string | null;
  otherName: string;
  callState: CallState;
  setCallState: React.Dispatch<React.SetStateAction<CallState>>;
}) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [hasMultipleCams, setHasMultipleCams] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Ask for camera + mic permission up-front and detect front/back cameras
  const ensureMediaPermission = useCallback(async (kind: CallKind) => {
    const probe = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === "video",
    });
    probe.getTracks().forEach((t) => t.stop());
    if (kind === "video") {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        setHasMultipleCams(cams.length > 1);
      } catch {
        setHasMultipleCams(false);
      }
    }
  }, []);

  const getCallStream = useCallback(
    async (kind: CallKind, want: "user" | "environment") => {
      if (kind !== "video") return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: { exact: want } },
        });
      } catch {
        return navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: want } });
      }
    },
    [],
  );

  const flipCamera = useCallback(async () => {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream || switching) return;
    const next = facing === "user" ? "environment" : "user";
    setSwitching(true);
    try {
      let newStream: MediaStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: next } },
        });
      } catch {
        newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next } });
      }
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = !camOff;
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);
      stream.getVideoTracks().forEach((t) => {
        t.stop();
        stream.removeTrack(t);
      });
      stream.addTrack(newTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setFacing(next);
    } catch (err) {
      console.error("flip camera failed", err);
    } finally {
      setSwitching(false);
    }
  }, [facing, camOff, switching]);

  const send = useCallback((payload: SignalPayload) => {
    channelRef.current?.send({ type: "broadcast", event: "signal", payload });
  }, []);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    pendingIceRef.current = [];
    setMuted(false);
    setCamOff(false);
  }, []);

  const endCall = useCallback((notify: boolean) => {
    if (notify && otherId) send({ type: "call-end", from: userId, to: otherId });
    cleanup();
    setCallState({ status: "idle" });
  }, [otherId, userId, send, cleanup, setCallState]);

  // Signaling channel (always on when both users known)
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel("call-room", { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
      const p = payload as SignalPayload;
      if (p.to !== userId) return;
      const pc = pcRef.current;
      if (p.type === "call-request") {
        setCallState({ status: "incoming", kind: p.kind, from: p.from, offer: p.offer });
      } else if (p.type === "call-accept" && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(p.answer));
        for (const c of pendingIceRef.current) await pc.addIceCandidate(new RTCIceCandidate(c));
        pendingIceRef.current = [];
        setCallState((s) => (s.status === "outgoing" ? { status: "in-call", kind: s.kind, peer: p.from } : s));
      } else if (p.type === "ice" && pc) {
        if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
        else pendingIceRef.current.push(p.candidate);
      } else if (p.type === "call-end" || p.type === "call-decline") {
        cleanup();
        setCallState({ status: "idle" });
      }
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, [userId, cleanup, setCallState]);

  const buildPc = useCallback((peer: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "ice", from: userId, to: peer, candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };
    return pc;
  }, [send, userId]);

  const startOutgoing = useCallback(async (kind: CallKind) => {
    if (!otherId) return;
    try {
      await ensureMediaPermission(kind);
      setFacing("user");
      const stream = await getCallStream(kind, "user");
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = buildPc(otherId);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setCallState({ status: "outgoing", kind, to: otherId });
      send({ type: "call-request", from: userId, to: otherId, kind, offer });
    } catch (err) {
      console.error(err);
      alert("Could not access microphone/camera. Please grant permission.");
      cleanup();
      setCallState({ status: "idle" });
    }
  }, [otherId, userId, buildPc, send, cleanup, setCallState, ensureMediaPermission, getCallStream]);

  const acceptIncoming = useCallback(async () => {
    if (callState.status !== "incoming") return;
    const { kind, from, offer } = callState;
    try {
      await ensureMediaPermission(kind);
      setFacing("user");
      const stream = await getCallStream(kind, "user");
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = buildPc(from);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "call-accept", from: userId, to: from, answer });
      for (const c of pendingIceRef.current) await pc.addIceCandidate(new RTCIceCandidate(c));
      pendingIceRef.current = [];
      setCallState({ status: "in-call", kind, peer: from });
    } catch (err) {
      console.error(err);
      alert("Could not access microphone/camera.");
      send({ type: "call-decline", from: userId, to: from });
      cleanup();
      setCallState({ status: "idle" });
    }
  }, [callState, buildPc, send, userId, cleanup, setCallState, ensureMediaPermission, getCallStream]);

  const declineIncoming = useCallback(() => {
    if (callState.status !== "incoming") return;
    send({ type: "call-decline", from: userId, to: callState.from });
    cleanup();
    setCallState({ status: "idle" });
  }, [callState, send, userId, cleanup, setCallState]);

  // Expose startOutgoing via a ref-like effect (window trick)
  useEffect(() => {
    (window as unknown as { __startCall?: (k: CallKind) => void }).__startCall = startOutgoing;
    return () => { delete (window as unknown as { __startCall?: (k: CallKind) => void }).__startCall; };
  }, [startOutgoing]);

  const toggleMute = () => {
    const enabled = !muted;
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = enabled ? false : true));
    setMuted(enabled);
  };
  const toggleCam = () => {
    const enabled = !camOff;
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = enabled ? false : true));
    setCamOff(enabled);
  };

  if (callState.status === "idle") return null;

  const kind = callState.status === "in-call" || callState.status === "outgoing" || callState.status === "incoming"
    ? callState.kind : "audio";
  const label =
    callState.status === "outgoing" ? `Calling ${otherName}…` :
    callState.status === "incoming" ? `${otherName} is calling` :
    otherName;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="p-6 text-center">
        <p className="text-sm text-white/60">{kind === "video" ? "Video call" : "Voice call"}</p>
        <h2 className="mt-1 text-2xl font-semibold">{label}</h2>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {kind === "video" && (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
            <video ref={localVideoRef} autoPlay playsInline muted className="absolute right-4 top-4 h-40 w-28 rounded-2xl border border-white/20 object-cover shadow-lg" />
          </>
        )}
        {kind === "audio" && (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
            <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />
            <div className="grid h-full place-items-center">
              <div className="grid h-40 w-40 place-items-center rounded-full bg-white/10 text-6xl font-semibold">
                {otherName?.[0] ?? "•"}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="flex items-center justify-center gap-4 p-6">
        {callState.status === "incoming" ? (
          <>
            <button onClick={declineIncoming} className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-lg active:scale-95">
              <PhoneOff size={26} />
            </button>
            <button onClick={acceptIncoming} className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 shadow-lg active:scale-95">
              <Phone size={26} />
            </button>
          </>
        ) : (
          <>
            <button onClick={toggleMute} className={`grid h-14 w-14 place-items-center rounded-full ${muted ? "bg-white text-black" : "bg-white/15"} active:scale-95`}>
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            {kind === "video" && (
              <button onClick={toggleCam} className={`grid h-14 w-14 place-items-center rounded-full ${camOff ? "bg-white text-black" : "bg-white/15"} active:scale-95`}>
                {camOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
            )}
            <button onClick={() => endCall(true)} className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-lg active:scale-95">
              <PhoneOff size={26} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
