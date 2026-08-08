import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Phone, Video, MoreVertical } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { CallOverlay, type CallState } from "@/components/CallOverlay";
import { toast } from "sonner";
import { readOutbox, enqueue, dequeue, newOutboxId, type OutboxItem } from "@/lib/outbox";

// Attachments are stored in messages.image_urls. Plain entries are images;
// generic files are encoded as `file|<encoded name>|<storage path>`.
type Attachment = { kind: "image" | "file"; path: string; name: string };
function parseAttachment(entry: string): Attachment {
  if (entry.startsWith("file|")) {
    const [, name, ...rest] = entry.split("|");
    return { kind: "file", path: rest.join("|"), name: decodeURIComponent(name || "file") };
  }
  return { kind: "image", path: entry, name: entry.split("/").pop() || "image" };
}
function formatBytes(n: number) {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

type Message = {
  id: string;
  sender_id: string;
  body: string | null;
  image_urls: string[];
  created_at: string;
  read_at: string | null;
  reply_to_id: string | null;
  audio_url?: string | null;
  audio_duration?: number | null;
};

type Profile = { id: string; username: string; display_name: string };

const EMOJIS = [
  "❤️","😂","😍","😘","🥰","😊","😭","🔥","✨","🌸","💜","💕","😉","😴","🙈","🌙","☀️","🎀",
  "😀","😁","😆","😅","🤣","😇","🙂","😌","😋","😜","🤪","😝","🤗","🤔","🤩","🥳","😎","🤠",
  "😢","😩","😤","😡","🥺","😳","😱","😬","🤯","😷","🤒","🤧","🥶","🥵","😈","👻","💀","🤖",
  "❤️‍🔥","💖","💗","💘","💝","💞","💓","💟","💌","💋","👀","👑","🌹","🌷","🌻","🌼","🌈","⭐",
  "🎉","🎊","🎁","🍰","🧁","🍫","🍓","🍒","🍑","🍎","☕","🍷","🥂","🍾","🎶","🎵","🌊","🌟",
  "👍","👎","👏","🙏","🙌","💪","🤝","🤗","🫶","💯","✅","❌"
];

function formatTime(d: string) {
  const date = new Date(d);
  return format(date, "h:mm a");
}
function formatDay(d: string) {
  const date = new Date(d);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}
function formatLastSeen(d: string) {
  const date = new Date(d);
  if (isToday(date)) return `today at ${format(date, "h:mm a")}`;
  if (isYesterday(date)) return `yesterday at ${format(date, "h:mm a")}`;
  return format(date, "MMM d, h:mm a");
}
function formatDuration(total: number) {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function MicIcon({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 19v3M8 22h8" />
    </svg>
  );
}

function VoiceNote({ url, duration, mine }: { url: string | null; duration: number; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const total = duration || 0;
  const pct = total ? Math.min(100, (pos / total) * 100) : 0;

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { a.play().catch(() => {}); }
  }

  return (
    <div className="flex min-w-[210px] items-center gap-3 px-3 py-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        disabled={!url}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${mine ? "bg-white/20 text-white" : "bg-[#25D366] text-white"} disabled:opacity-50`}
      >
        {playing ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-6 items-center gap-[3px]">
          {Array.from({ length: 26 }).map((_, i) => {
            const active = (i / 26) * 100 <= pct;
            const h = 6 + ((i * 7) % 14);
            return (
              <span
                key={i}
                className={`w-[3px] rounded-full ${active ? (mine ? "bg-white" : "bg-[#25D366]") : mine ? "bg-white/35" : "bg-slate-300"}`}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>
        <div className={`mt-0.5 flex items-center gap-1 text-[11px] ${mine ? "text-white/80" : "text-slate-500"}`}>
          <MicIcon className="h-3 w-3" />
          <span className="tabular-nums">{formatDuration(playing || pos ? pos : total)}</span>
        </div>
      </div>
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setPos((e.target as HTMLAudioElement).currentTime)}
          onEnded={() => { setPlaying(false); setPos(0); }}
          className="hidden"
        />
      )}
    </div>
  );
}

// Notifications: use the service worker when available (required on Android/mobile),
// fall back to the plain Notification constructor on desktop.
async function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  // Only alert when the app isn't actually being looked at.
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  const options: NotificationOptions = {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: "youandme-message",
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return;
    }
  } catch { /* fall through */ }
  try {
    const n = new Notification(title, options);
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* ignore */ }
}



function ChatPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [previewOpen, setPreviewOpen] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [kbInset, setKbInset] = useState(0);
  const [callState, setCallState] = useState<CallState>({ status: "idle" });
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState<OutboxItem[]>([]);
  const flushingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recStream = useRef<MediaStream | null>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recCancelled = useRef(false);
  const recSecsRef = useRef(0);
  const otherLastSeenRef = useRef<string | null>(null);
  const meUsernameRef = useRef<string | null>(null);
  const otherNameRef = useRef<string>("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bootstrap: user, profiles, messages
  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) { navigate({ to: "/auth" }); return; }
      setUserId(uid);

      const { data: profs } = await supabase.from("profiles").select("*");
      if (profs) {
        const map: Record<string, Profile> = {};
        profs.forEach((p) => { map[p.id] = p as Profile; });
        setProfiles(map);
      }

      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true });
      if (msgs) setMessages(msgs as Message[]);
    })();
  }, [navigate]);

  // Realtime subscriptions
  useEffect(() => {
    if (!userId) return;

    const msgChannel = supabase
      .channel("messages-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const next = payload.new as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === next.id)) return prev;
          return [...prev, next];
        });
        // Notify Manmadha when Likhitha sends a message and the app isn't in view.
        if (next.sender_id !== userId && meUsernameRef.current === "manmadha") {
          notify(
            otherNameRef.current || "New message",
            next.body || (next.image_urls?.length ? "📷 Photo" : next.audio_url ? "🎤 Voice message" : "New message"),
          );
        }
      })


      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const next = payload.new as Message;
        setMessages((prev) => prev.map((m) => (m.id === next.id ? next : m)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const oldRow = payload.old as { id: string };
        setMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
      })
      .subscribe();

    const typingChannel = supabase
      .channel("typing-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "typing_status" }, (payload) => {
        const row = payload.new as { user_id: string; is_typing: boolean };
        if (row && row.user_id !== userId) setOtherTyping(row.is_typing);
      })
      .subscribe();

    const presenceChannel = supabase
      .channel("presence-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" }, (payload) => {
        const row = payload.new as { user_id: string; last_seen: string; is_online?: boolean };
        if (row && row.user_id !== userId) {
          const fresh = Date.now() - new Date(row.last_seen).getTime() < 45_000;
          setOtherOnline(Boolean(row.is_online) && fresh);
          setOtherLastSeen(row.last_seen);
        }
      })
      .subscribe();

    // Initial presence + typing status
    supabase.from("presence").select("*").then(({ data }) => {
      const other = data?.find((p) => p.user_id !== userId) as
        | { last_seen: string; is_online?: boolean }
        | undefined;
      if (other) {
        const fresh = Date.now() - new Date(other.last_seen).getTime() < 45_000;
        setOtherOnline(Boolean(other.is_online) && fresh);
        setOtherLastSeen(other.last_seen);
      }
    });
    supabase.from("typing_status").select("*").then(({ data }) => {
      const other = data?.find((t) => t.user_id !== userId);
      if (other) setOtherTyping(other.is_typing);
    });

    // Heartbeat: I'm "online" only while the chat page is open AND visible.
    const beat = async (online: boolean) => {
      await supabase
        .from("presence")
        .upsert({ user_id: userId, last_seen: new Date().toISOString(), is_online: online } as never);
    };
    beat(document.visibilityState === "visible");
    const interval = setInterval(() => beat(document.visibilityState === "visible"), 15_000);
    const onVisible = () => beat(document.visibilityState === "visible");
    const goOffline = () => { void beat(false); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", goOffline);

    // Re-evaluate the other person's freshness locally so "online" expires on its own.
    const staleCheck = setInterval(() => {
      setOtherOnline((prev) => {
        if (!prev) return prev;
        const ls = otherLastSeenRef.current;
        if (!ls) return prev;
        return Date.now() - new Date(ls).getTime() < 45_000;
      });
    }, 10_000);

    return () => {
      void beat(false);
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
      supabase.removeChannel(presenceChannel);
      clearInterval(interval);
      clearInterval(staleCheck);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", goOffline);
    };
  }, [userId]);

  // Keep identity refs in sync + register the service worker for notifications
  useEffect(() => {
    if (!userId) return;
    const me = profiles[userId];
    const other = Object.values(profiles).find((p) => p.id !== userId);
    meUsernameRef.current = me?.username ?? null;
    otherNameRef.current = other?.display_name ?? "";
    if (me?.username === "manmadha" && typeof window !== "undefined") {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    }
  }, [profiles, userId]);


  // Auto-scroll to bottom on new messages (instant jump on first load)
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (!messages.length) return;
    if (!didInitialScroll.current) {
      didInitialScroll.current = true;
      bottomRef.current?.scrollIntoView({ block: "end" });
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
      setTimeout(() => bottomRef.current?.scrollIntoView({ block: "end" }), 150);
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, otherTyping]);

  // Track mobile keyboard: shrink chat area by the visual-viewport delta so composer stays visible.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const delta = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbInset(delta);
      // Keep the latest message pinned when keyboard opens
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    onResize();
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!showMobileMenu) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-mobile-menu]")) setShowMobileMenu(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [showMobileMenu]);

  // Keep last-seen ref in sync for the staleness check
  useEffect(() => { otherLastSeenRef.current = otherLastSeen; }, [otherLastSeen]);

  // Mark received messages as read — only while the chat is actually being viewed
  useEffect(() => {
    if (!userId) return;

    const markRead = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      const unread = messages.filter((m) => m.sender_id !== userId && !m.read_at);
      if (unread.length === 0) return;
      supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unread.map((m) => m.id))
        .then(() => {});
    };

    markRead();
    window.addEventListener("focus", markRead);
    document.addEventListener("visibilitychange", markRead);
    return () => {
      window.removeEventListener("focus", markRead);
      document.removeEventListener("visibilitychange", markRead);
    };
  }, [messages, userId]);


  // Sign URLs for images + voice notes (private bucket)
  useEffect(() => {
    const paths = new Set<string>();
    messages.forEach((m) => m.image_urls?.forEach((p) => {
      const path = parseAttachment(p).path;
      if (path && !signedUrls[path]) paths.add(path);
    }));
    messages.forEach((m) => { if (m.audio_url && !signedUrls[m.audio_url]) paths.add(m.audio_url); });
    if (paths.size === 0) return;
    (async () => {
      const arr = Array.from(paths);
      const { data } = await supabase.storage.from("chat-images").createSignedUrls(arr, 60 * 60 * 24);
      if (data) {
        const next: Record<string, string> = {};
        data.forEach((r, i) => { if (r.signedUrl) next[arr[i]] = r.signedUrl; });
        setSignedUrls((prev) => ({ ...prev, ...next }));
      }
    })();
  }, [messages, signedUrls]);

  const messagesById = useMemo(() => {
    const map: Record<string, Message> = {};
    messages.forEach((m) => { map[m.id] = m; });
    return map;
  }, [messages]);

  const filteredMessages = useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter((m) => (m.body || "").toLowerCase().includes(q));
  }, [messages, search]);

  const grouped = useMemo(() => {
    const groups: { day: string; items: Message[] }[] = [];
    filteredMessages.forEach((m) => {
      const day = formatDay(m.created_at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(m);
      else groups.push({ day, items: [m] });
    });
    return groups;
  }, [filteredMessages]);

  const setTyping = useCallback((val: boolean) => {
    if (!userId) return;
    supabase.from("typing_status").upsert({ user_id: userId, is_typing: val, updated_at: new Date().toISOString() });
  }, [userId]);

  function onTextChange(v: string) {
    setText(v);
    setTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 1200);
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files);
    setPendingImages((prev) => [...prev, ...arr]);
  }

  async function uploadImages(files: File[]): Promise<string[]> {
    if (!userId || files.length === 0) return [];
    const paths: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("chat-images").upload(path, file, {
        cacheControl: "31536000",
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) {
        toast.error(`Could not upload ${file.name}`);
        continue;
      }
      const isImage = file.type.startsWith("image/") || file.type.startsWith("video/");
      paths.push(isImage ? path : `file|${encodeURIComponent(file.name)}|${path}`);
    }
    return paths;
  }

  // ---- Offline queue ----
  async function queueMessage(item: Omit<OutboxItem, "id" | "createdAt">) {
    const full: OutboxItem = { ...item, id: newOutboxId(), createdAt: new Date().toISOString() };
    setQueued(await enqueue(full));
    toast("Saved — will send when you're back online");
  }

  const flushOutbox = useCallback(async () => {
    if (flushingRef.current || typeof navigator === "undefined" || !navigator.onLine) return;
    flushingRef.current = true;
    let sent = 0;
    try {
      const items = await readOutbox();
      for (const it of items) {
        try {
          if (it.audio) {
            const ext = it.audio.mime.includes("mp4") || it.audio.mime.includes("aac") ? "m4a" : "webm";
            const path = `${it.senderId}/voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("chat-images")
              .upload(path, it.audio.blob, { cacheControl: "31536000", contentType: it.audio.mime });
            if (upErr) throw upErr;
            const { error } = await supabase.from("messages").insert({
              sender_id: it.senderId,
              body: null,
              image_urls: [],
              audio_url: path,
              audio_duration: it.audio.secs,
              reply_to_id: it.replyToId,
            });
            if (error) throw error;
          } else {
            const paths = it.files.length ? await uploadImages(it.files) : [];
            if (it.files.length && paths.length !== it.files.length) throw new Error("upload-failed");
            const { error } = await supabase.from("messages").insert({
              sender_id: it.senderId,
              body: it.body,
              image_urls: paths,
              reply_to_id: it.replyToId,
            });
            if (error) throw error;
          }
          setQueued(await dequeue(it.id));
          sent++;
        } catch {
          break; // still offline / failing — keep the rest queued in order
        }
      }
      if (sent > 0) {
        // Re-sync so delivery/read ticks reflect the server state
        const { data } = await supabase.from("messages").select("*").order("created_at", { ascending: true });
        if (data) setMessages(data as Message[]);
        toast.success(`${sent} queued message${sent > 1 ? "s" : ""} sent`);
      }
    } finally {
      flushingRef.current = false;
    }
  }, [userId]);

  // Track connectivity, restore the queue, and flush when back online
  useEffect(() => {
    if (!userId) return;
    setOnline(navigator.onLine);
    readOutbox().then(setQueued);
    const onOnline = () => { setOnline(true); void flushOutbox(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void flushOutbox();
    const retry = setInterval(() => { void flushOutbox(); }, 15_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(retry);
    };
  }, [userId, flushOutbox]);

  async function sendMessage() {
    if (!userId) return;
    const body = text.trim();
    if (!body && pendingImages.length === 0) return;

    if (!navigator.onLine) {
      await queueMessage({
        senderId: userId,
        body: body || null,
        files: pendingImages,
        replyToId: replyTo?.id ?? null,
      });
      setText("");
      setPendingImages([]);
      setReplyTo(null);
      setTyping(false);
      return;
    }

    setUploading(true);
    setTyping(false);
    const imgs = pendingImages.length ? await uploadImages(pendingImages) : [];
    const failedUpload = pendingImages.length > 0 && imgs.length !== pendingImages.length;
    const { error } = failedUpload
      ? { error: new Error("upload-failed") }
      : await supabase.from("messages").insert({
          sender_id: userId,
          body: body || null,
          image_urls: imgs,
          reply_to_id: replyTo?.id ?? null,
        });
    if (!error) {
      setText("");
      setPendingImages([]);
      setReplyTo(null);
    } else {
      await queueMessage({
        senderId: userId,
        body: body || null,
        files: pendingImages,
        replyToId: replyTo?.id ?? null,
      });
      setText("");
      setPendingImages([]);
      setReplyTo(null);
    }
    setUploading(false);
  }


  async function sendLocation() {
    if (!userId) return;
    if (!("geolocation" in navigator)) {
      toast.error("Location is not supported on this device");
      return;
    }
    setUploading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const link = `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
        const { error } = await supabase.from("messages").insert({
          sender_id: userId,
          body: `📍 My current location\n${link}`,
          image_urls: [],
          reply_to_id: replyTo?.id ?? null,
        });
        if (error) toast.error("Could not send location");
        else setReplyTo(null);
        setUploading(false);
      },
      () => {
        setUploading(false);
        toast.error("Location permission denied");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  // ---- Voice notes (WhatsApp-style) ----
  function stopTracks() {
    recStream.current?.getTracks().forEach((t) => t.stop());
    recStream.current = null;
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
  }

  async function startRecording() {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStream.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"].find(
        (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
      );
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunks.current = [];
      recCancelled.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) recChunks.current.push(e.data); };
      rec.onstop = async () => {
        const secs = recSecsRef.current;
        const blob = new Blob(recChunks.current, { type: rec.mimeType || "audio/webm" });
        stopTracks();
        setRecording(false);
        setRecSecs(0);
        if (recCancelled.current || blob.size < 800 || secs < 1) return;
        await sendVoice(blob, secs, rec.mimeType || "audio/webm");
      };
      rec.start(200);
      recorderRef.current = rec;
      setRecording(true);
      setRecSecs(0);
      recSecsRef.current = 0;
      recTimer.current = setInterval(() => {
        recSecsRef.current += 1;
        setRecSecs(recSecsRef.current);
      }, 1000);
    } catch {
      stopTracks();
      setRecording(false);
      alert("Microphone permission is needed to record a voice message.");
    }
  }

  function cancelRecording() {
    recCancelled.current = true;
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    stopTracks();
    setRecording(false);
    setRecSecs(0);
  }

  function finishRecording() {
    recCancelled.current = false;
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
  }

  async function sendVoice(blob: Blob, secs: number, mime: string) {
    if (!userId) return;
    if (!navigator.onLine) {
      await queueMessage({
        senderId: userId,
        body: null,
        files: [],
        replyToId: replyTo?.id ?? null,
        audio: { blob, secs, mime },
      });
      setReplyTo(null);
      return;
    }
    setUploading(true);
    const ext = mime.includes("mp4") || mime.includes("aac") ? "m4a" : "webm";
    const path = `${userId}/voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("chat-images").upload(path, blob, {
      cacheControl: "31536000",
      contentType: mime,
    });
    if (!upErr) {
      const { error } = await supabase.from("messages").insert({
        sender_id: userId,
        body: null,
        image_urls: [],
        audio_url: path,
        audio_duration: secs,
        reply_to_id: replyTo?.id ?? null,
      });
      if (error) {
        await queueMessage({ senderId: userId, body: null, files: [], replyToId: replyTo?.id ?? null, audio: { blob, secs, mime } });
      }
      setReplyTo(null);
    } else {
      await queueMessage({ senderId: userId, body: null, files: [], replyToId: replyTo?.id ?? null, audio: { blob, secs, mime } });
      setReplyTo(null);
    }
    setUploading(false);
  }

  useEffect(() => () => { stopTracks(); }, []);

  async function deleteMessage(id: string) {
    await supabase.from("messages").delete().eq("id", id);
  }

  async function editMessage(id: string, newBody: string) {
    const body = newBody.trim();
    if (!body) return;
    const before = messages.find((m) => m.id === id)?.body ?? null;
    if (before === body) return;
    // Optimistic update — created_at stays untouched so the original time is kept
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body } : m)));
    const { data, error } = await supabase.from("messages").update({ body }).eq("id", id).select("id");
    if (error || !data || data.length === 0) {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body: before } : m)));
      toast.error(navigator.onLine ? "Could not update the message" : "You're offline — try again once connected");
    }
  }


  async function copyText(t: string) {
    try { await navigator.clipboard.writeText(t); } catch {}
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const otherProfile = useMemo(() => {
    return Object.values(profiles).find((p) => p.id !== userId);
  }, [profiles, userId]);

  const meUsername = userId ? profiles[userId]?.username : undefined;


  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        height: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: `calc(env(safe-area-inset-bottom) + ${kbInset}px)`,
        background: "linear-gradient(180deg, #4facfe 0%, #4facfe 42%, #9fd8f7 62%, #d9eefb 80%, #f7f5ef 100%)",
      }}
    >
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-[oklch(0.55_0.18_200)] opacity-30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[oklch(0.45_0.24_310)] opacity-35 blur-3xl" />
      </div>

      {/* Header */}
      <header className="glass sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button
          type="button"
          aria-label="Back to auth"
          onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[oklch(0.45_0.22_300)] shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <ArrowLeft size={22} strokeWidth={2.5} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-kameron text-lg font-bold leading-tight"><span className="text-white drop-shadow">You</span><span className="text-black">And</span><span className="text-white drop-shadow">Me</span></div>
          <div className="flex items-center gap-1.5 text-[11px] leading-snug text-white/70">
            <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${otherOnline ? "bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/80" : "bg-white/30"}`} />
            <span className="whitespace-normal break-words">
              {otherProfile ? (
                <>
                  <span className="font-semibold text-white">{otherProfile.display_name}</span>
                  <span className="text-white/80">
                    {" "}is {otherOnline ? (otherTyping ? "typing…" : "online") : "offline"}
                  </span>
                  {!otherOnline && otherLastSeen && (
                    <span className="text-white/70"> · last seen {formatLastSeen(otherLastSeen)}</span>
                  )}
                </>
              ) : (
                <span className="text-white/70">{otherOnline ? "online" : "offline"}</span>
              )}
            </span>
          </div>

        </div>
        <button
          aria-label="Voice call"
          onClick={() => (window as unknown as { __startCall?: (k: "audio" | "video") => void }).__startCall?.("audio")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95"
        >
          <Phone size={18} />
        </button>
        <button
          aria-label="Video call"
          onClick={() => (window as unknown as { __startCall?: (k: "audio" | "video") => void }).__startCall?.("video")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95"
        >
          <Video size={18} />
        </button>
        <button aria-label="Search" onClick={() => { if (showSearch) setSearch(""); setShowSearch((v) => !v); }} className="hidden sm:grid h-10 w-10 place-items-center rounded-full bg-white/5 text-white/80 hover:bg-white/10">

          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        </button>
        <button onClick={signOut} className="hidden sm:inline-flex shrink-0 rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/10">
          Logout
        </button>

        {/* Mobile three-dot menu */}
        <div className="relative sm:hidden" data-mobile-menu>
          <button
            aria-label="More options"
            onClick={() => setShowMobileMenu((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95"
          >
            <MoreVertical size={20} />
          </button>
          {showMobileMenu && (
            <div className="absolute right-0 top-full mt-2 min-w-[140px] overflow-hidden rounded-2xl border border-white/10 bg-[#1a2d5c]/95 shadow-xl backdrop-blur-md animate-fade-in z-50">
              <button
                onClick={() => { setShowMobileMenu(false); if (showSearch) setSearch(""); setShowSearch((v) => !v); }}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-white hover:bg-white/10"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                Search
              </button>
              <div className="h-px bg-white/10" />
              <button
                onClick={() => { setShowMobileMenu(false); signOut(); }}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-white hover:bg-white/10"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {showSearch && (
        <div className="glass border-b border-white/10 px-4 py-2 animate-fade-in">
          <div className="relative">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages…"
              className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 pr-10 text-sm text-white placeholder-white/40 outline-none focus:border-white/30"
            />
            <button
              type="button"
              aria-label="Close search"
              onClick={() => { setSearch(""); setShowSearch(false); }}
              className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {(!online || queued.length > 0) && (
        <div className="flex items-center justify-center gap-2 bg-[#1f2126] px-3 py-1.5 text-[12px] font-semibold text-white">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-amber-400" : "bg-red-400"}`} />
          {online
            ? `Syncing ${queued.length} queued message${queued.length > 1 ? "s" : ""}…`
            : queued.length > 0
              ? `Offline — ${queued.length} message${queued.length > 1 ? "s" : ""} will send when reconnected`
              : "You're offline — messages will be queued"}
        </div>
      )}


      {/* Messages */}
      <div
        ref={scrollRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        className="scrollbar-hide flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {grouped.length === 0 && (
          <div className="mt-20 text-center text-sm text-white/50">
            <p className="font-display text-2xl text-gradient">say hi 💜</p>
            <p className="mt-2">Your conversation starts here.</p>
          </div>
        )}

        {grouped.map((g) => (
          <div key={g.day} className="space-y-2">
            <div className="my-4 flex items-center justify-center">
              <span className="rounded-full bg-[#1f2126] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-widest text-white shadow-md">{g.day}</span>
            </div>
            {g.items.map((m) => {
              const mine = m.sender_id === userId;
              const parent = m.reply_to_id ? messagesById[m.reply_to_id] : undefined;
              const parentAuthor = parent ? profiles[parent.sender_id] : undefined;
              return (
                <MessageBubble
                  key={m.id}
                  mine={mine}
                  m={m}
                  parent={parent}
                  parentAuthor={parentAuthor?.display_name}
                  signedUrls={signedUrls}
                  onOpenImage={setPreviewOpen}
                  onDelete={() => deleteMessage(m.id)}
                  onCopy={() => m.body && copyText(m.body)}
                  onReply={() => { setReplyTo(m); textareaRef.current?.focus(); }}
                  onEdit={(nb) => editMessage(m.id, nb)}
                />
              );
            })}
          </div>
        ))}

        {/* Queued (offline) messages waiting to sync */}
        {queued.map((q) => (
          <div key={q.id} className="flex justify-end">
            <div className="max-w-[78%] rounded-3xl rounded-br-md bg-[oklch(0.45_0.16_265)]/80 px-4 py-2 text-white shadow-lg">
              {q.audio ? (
                <p className="text-[15px]">🎤 Voice message</p>
              ) : (
                <>
                  {q.body && <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{q.body}</p>}
                  {q.files.length > 0 && (
                    <p className="text-[13px] opacity-90">
                      📎 {q.files.length} file{q.files.length > 1 ? "s" : ""}
                    </p>
                  )}
                </>
              )}
              <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-white/80">
                <span>{formatTime(q.createdAt)}</span>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <span>waiting</span>
              </div>
            </div>
          </div>
        ))}



        {otherTyping && (
          <div className="flex justify-start">
            <div className="glass flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-white/90">
              <span>typing</span>
              <span className="inline-flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="inline-block h-1 w-1 rounded-full bg-white/80" style={{ animation: `typing-bounce 1.2s ${i * 0.15}s infinite` }} />
                ))}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Pending attachments preview */}
      {pendingImages.length > 0 && (
        <div className="glass flex gap-2 overflow-x-auto border-t border-white/10 px-3 py-2">
          {pendingImages.map((f, i) => {
            const isMedia = f.type.startsWith("image/") || f.type.startsWith("video/");
            return (
              <div key={i} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/20">
                {isMedia ? (
                  <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-white/10 px-1 text-center">
                    <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                    <span className="w-full truncate text-[9px] leading-tight text-white/80">{f.name}</span>
                    <span className="text-[9px] text-white/50">{formatBytes(f.size)}</span>
                  </div>
                )}
                <button
                  onClick={() => setPendingImages((prev) => prev.filter((_, x) => x !== i))}
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-xs text-white"
                  aria-label="Remove"
                >×</button>
              </div>
            );
          })}
          <p className="self-center px-2 text-xs text-white/50">{pendingImages.length} selected</p>
        </div>
      )}



      {/* Emoji row */}
      {showEmojis && (
        <div className="glass grid grid-cols-9 gap-1 border-t border-white/10 px-3 py-2 animate-fade-in">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => setText((t) => t + e)} className="text-xl hover:scale-125 transition-transform">
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Reply banner */}
      {replyTo && (
        <div className="glass flex items-center gap-2 border-t border-white/10 px-3 py-2 animate-fade-in">
          <div className="h-10 w-1 shrink-0 rounded-full bg-[oklch(0.75_0.2_200)]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-[oklch(0.85_0.15_200)]">
              Replying to {profiles[replyTo.sender_id]?.display_name ?? "message"}
            </div>
            <div className="truncate text-xs text-white/70">
              {replyTo.body || (replyTo.image_urls?.length ? "📷 Photo" : replyTo.audio_url ? "🎤 Voice message" : "")}
            </div>
          </div>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={() => setReplyTo(null)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Composer — recording state (WhatsApp style) */}
      {recording ? (
        <div className="glass sticky bottom-0 z-20 flex items-center gap-3 border-t border-white/10 px-3 py-3">
          <button
            type="button"
            aria-label="Cancel recording"
            onClick={cancelRecording}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-black active:scale-95"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
          <div
            className="flex min-h-12 flex-1 items-center gap-3 rounded-3xl border border-white/20 px-4 text-white shadow-inner"
            style={{ backgroundImage: "linear-gradient(90deg, #0d5c63 0%, #3d1f6b 50%, #0d5c63 100%)" }}
          >
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="tabular-nums text-[15px] font-semibold">{formatDuration(recSecs)}</span>
            <span className="truncate text-xs text-white/70">Recording… tap <span className="inline-flex align-middle"><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></span> to delete</span>
          </div>
          <button
            type="button"
            onClick={finishRecording}
            aria-label="Send voice message"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#25D366] text-white shadow-lg transition active:scale-95"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </button>
        </div>
      ) : (
      <div className="glass sticky bottom-0 z-20 flex items-center gap-2 border-t border-white/10 px-3 py-3">
        {/* Desktop-only voice record button */}
        <button
          type="button"
          aria-label="Record voice message"
          onClick={startRecording}
          className="hidden sm:grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/5 text-white hover:bg-white/10"
        >
          <MicIcon />
        </button>
        {/* Desktop-only emoji button */}
        <button
          aria-label={showEmojis ? "Close emojis" : "Emoji"}
          onClick={() => setShowEmojis((v) => !v)}
          className="hidden sm:grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/5 text-xl hover:bg-white/10"
        >
          {showEmojis ? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          ) : (
            <span>😊</span>
          )}
        </button>
        {/* Desktop-only attach button */}
        <div className="relative hidden sm:block">
          <button
            aria-label="Attach"
            onClick={() => setShowAttach((v) => !v)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/5 hover:bg-white/10"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          {showAttach && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowAttach(false)} />
              <div className="absolute bottom-full left-0 z-40 mb-2 flex min-w-[180px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm shadow-2xl">
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left font-medium text-slate-900 hover:bg-slate-100"
                  onClick={() => { setShowAttach(false); cameraInputRef.current?.click(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Camera
                </button>
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left font-medium text-slate-900 hover:bg-slate-100"
                  onClick={() => { setShowAttach(false); fileInputRef.current?.click(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                  Gallery
                </button>
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left font-medium text-slate-900 hover:bg-slate-100"
                  onClick={() => { setShowAttach(false); void sendLocation(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  Location
                </button>
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left font-medium text-slate-900 hover:bg-slate-100"
                  onClick={() => { setShowAttach(false); docInputRef.current?.click(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                  Files
                </button>
              </div>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={docInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
        {/* Textarea + mobile inline icons */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onFocus={() => { setShowEmojis(false); setShowAttach(false); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            rows={1}
            placeholder="Message"
            className="max-h-32 min-h-12 w-full resize-none rounded-3xl border border-white/20 px-4 py-3 pr-[142px] sm:pr-4 text-[15px] text-white placeholder-white/60 outline-none shadow-inner focus:border-white/40"
            style={{ backgroundImage: "linear-gradient(90deg, #0d5c63 0%, #3d1f6b 50%, #0d5c63 100%)" }}
          />
          {/* Mobile-only inline mic + attach + emoji — vertically centered, larger */}
          <div className="sm:hidden absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Record voice message"
              onClick={startRecording}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95"
            >
              <MicIcon />
            </button>
            <button
              type="button"
              aria-label="Attach"
              onClick={() => setShowAttach((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95"
            >
              <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button
              type="button"
              aria-label={showEmojis ? "Close emojis" : "Emoji"}
              onClick={() => setShowEmojis((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl hover:bg-white/20 active:scale-95"
            >
              {showEmojis ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              ) : (
                <span>😊</span>
              )}
            </button>
          </div>
          {/* Mobile attach menu */}
          {showAttach && (
            <div className="sm:hidden">
              <div className="fixed inset-0 z-30" onClick={() => setShowAttach(false)} />
              <div className="absolute bottom-full right-0 z-40 mb-2 flex min-w-[180px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm shadow-2xl">
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left font-medium text-slate-900 active:bg-slate-100"
                  onClick={() => { setShowAttach(false); cameraInputRef.current?.click(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Camera
                </button>
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left font-medium text-slate-900 active:bg-slate-100"
                  onClick={() => { setShowAttach(false); fileInputRef.current?.click(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                  Gallery
                </button>
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left font-medium text-slate-900 active:bg-slate-100"
                  onClick={() => { setShowAttach(false); void sendLocation(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  Location
                </button>
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left font-medium text-slate-900 active:bg-slate-100"
                  onClick={() => { setShowAttach(false); docInputRef.current?.click(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                  Files
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={sendMessage}
          disabled={uploading || (!text.trim() && pendingImages.length === 0)}
          aria-label="Send"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#25D366] text-white shadow-lg transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {uploading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          )}
        </button>
      </div>
      )}

      {/* Full-screen image viewer */}
      {previewOpen && (
        <ImageViewer url={signedUrls[previewOpen] || previewOpen} onClose={() => setPreviewOpen(null)} />
      )}

      {/* Voice / video call overlay */}
      {userId && (
        <CallOverlay
          userId={userId}
          otherId={otherProfile?.id ?? null}
          otherName={otherProfile?.display_name ?? "them"}
          callState={callState}
          setCallState={setCallState}
        />
      )}
    </div>
  );
}

function MessageBubble({
  mine,
  m,
  parent,
  parentAuthor,
  signedUrls,
  onOpenImage,
  onDelete,
  onCopy,
  onReply,
  onEdit,
}: {
  mine: boolean;
  m: Message;
  parent?: Message;
  parentAuthor?: string;
  signedUrls: Record<string, string>;
  onOpenImage: (path: string) => void;
  onDelete: () => void;
  onCopy: () => void;
  onReply: () => void;
  onEdit: (newBody: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(m.body ?? "");
  const [showDetails, setShowDetails] = useState(false);
  const [dragX, setDragX] = useState(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const swiping = useRef(false);
  const REPLY_THRESHOLD = 60;

  function startPress() {
    pressTimer.current = setTimeout(() => setMenu(true), 500);
  }
  function endPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    swiping.current = false;
    startPress();
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startX.current == null || startY.current == null) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (!swiping.current) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        swiping.current = true;
        endPress();
      } else if (Math.abs(dy) > 8) {
        endPress();
        return;
      } else {
        return;
      }
    }
    // Received messages swipe right; sent messages swipe left
    const clamped = mine ? Math.min(0, Math.max(-100, dx)) : Math.max(0, Math.min(100, dx));
    setDragX(clamped);
  }
  function onTouchEnd() {
    endPress();
    if (swiping.current && Math.abs(dragX) >= REPLY_THRESHOLD) {
      onReply();
    }
    setDragX(0);
    startX.current = null;
    startY.current = null;
    swiping.current = false;
  }

  const attachments = (m.image_urls || []).map(parseAttachment);
  const imgs = attachments.filter((a) => a.kind === "image").map((a) => a.path);
  const docs = attachments.filter((a) => a.kind === "file");
  const gridCols = imgs.length === 1 ? "grid-cols-1" : imgs.length === 2 ? "grid-cols-2" : imgs.length <= 4 ? "grid-cols-2" : "grid-cols-3";
  const reactionShown = Math.abs(dragX) >= 24;

  // Delivery status: any server-persisted message is "delivered"; blue when read_at set.
  const status: "delivered" | "read" = m.read_at ? "read" : "delivered";

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} animate-bubble-in relative`}>
      {/* Reply hint icon that appears when swiping */}
      {reactionShown && (
        <div
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white transition-opacity ${
            mine ? "right-2" : "left-2"
          }`}
          style={{ opacity: Math.min(1, Math.abs(dragX) / REPLY_THRESHOLD) }}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
        </div>
      )}
      <div
        onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="relative max-w-[82%] sm:max-w-[70%]"
        style={{ transform: `translateX(${dragX}px)`, transition: dragX === 0 ? "transform 0.2s ease-out" : "none" }}
      >
        <button
          type="button"
          aria-label="Reply"
          onClick={onReply}
          className={`absolute top-1/2 hidden -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 opacity-0 transition group-hover:opacity-100 sm:group-hover:flex ${mine ? "-left-9" : "-right-9"}`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
        </button>
        <div
          className={`overflow-hidden rounded-3xl px-1 py-1 shadow-[var(--shadow-soft)] ${
            mine
              ? "rounded-br-lg bg-[oklch(0.42_0.20_330)] text-white border border-white/15"
              : "rounded-bl-lg bg-white text-slate-900 border border-slate-200 shadow-sm"
          }`}
        >
          {parent && (
            <div className="mx-1 mt-1 flex gap-2 rounded-2xl border-l-[3px] border-[oklch(0.75_0.2_200)] bg-white/10 px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-[oklch(0.85_0.15_200)]">
                  {parentAuthor ?? "Message"}
                </div>
                <div className="truncate text-xs text-white/80">
                  {parent.body || (parent.image_urls?.length ? "📷 Photo" : parent.audio_url ? "🎤 Voice message" : "")}
                </div>
              </div>
            </div>
          )}
          {m.audio_url && (
            <VoiceNote
              url={signedUrls[m.audio_url] ?? null}
              duration={m.audio_duration ?? 0}
              mine={mine}
            />
          )}
          {imgs.length > 0 && (
            <div className={`grid gap-1 p-1 ${gridCols}`}>
              {imgs.map((path) => {
                const url = signedUrls[path];
                return (
                  <button
                    key={path}
                    onClick={() => onOpenImage(path)}
                    className="group relative overflow-hidden rounded-2xl"
                  >
                    {url ? (
                      <img
                        src={url}
                        loading="lazy"
                        alt=""
                        className="h-40 w-full object-cover transition-transform group-hover:scale-105 sm:h-52"
                      />
                    ) : (
                      <div className="grid h-40 w-full place-items-center bg-white/10 text-xs text-white/60 sm:h-52">Loading…</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {docs.length > 0 && (
            <div className="flex flex-col gap-1 p-1">
              {docs.map((d) => {
                const url = signedUrls[d.path];
                return (
                  <a
                    key={d.path}
                    href={url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={d.name}
                    onClick={(e) => { e.stopPropagation(); if (!url) e.preventDefault(); }}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${mine ? "bg-black/20" : "bg-black/10"} ${url ? "hover:opacity-90" : "opacity-60"}`}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/20">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{d.name}</span>
                      <span className="block text-[11px] opacity-70">{url ? "Tap to open / download" : "Preparing…"}</span>
                    </span>
                  </a>
                );
              })}
            </div>
          )}
          {m.body && !editing && (
            <p className={`whitespace-pre-wrap break-words px-4 py-2 text-[15px] leading-snug ${imgs.length > 0 ? "pt-2" : ""}`}>
              {m.body.split(/(https?:\/\/\S+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a
                    key={i}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="underline decoration-white/50 underline-offset-2 break-all"
                  >
                    {part}
                  </a>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
          )}
          {editing && (
            <div className="px-2 py-2">
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-2xl border border-white/25 bg-white/15 px-3 py-2 text-[15px] text-white placeholder-white/50 outline-none focus:border-white/50"
              />
              <div className="mt-1 flex justify-end gap-2">
                <button
                  onClick={() => { setEditing(false); setEditText(m.body ?? ""); }}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/90 hover:bg-white/20"
                >Cancel</button>
                <button
                  onClick={() => { onEdit(editText); setEditing(false); }}
                  className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black hover:opacity-90"
                >Save</button>
              </div>
            </div>
          )}
          <div className={`flex items-center justify-end gap-1 px-3 pb-2 pt-0.5 text-[10px] ${mine ? "text-white/80" : "text-slate-500"}`}>
            <span>{formatTime(m.created_at)}</span>
            {mine && (
              <span aria-label={status === "read" ? "Read" : "Delivered"} title={status === "read" ? "Read" : "Delivered"}>
                {status === "read" ? (
                  // Double check, blue = read
                  <svg className="h-3.5 w-4" viewBox="0 0 24 16" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 8l4 4 8-10" />
                    <path d="M9 12l3 3 10-13" />
                  </svg>
                ) : (
                  // Double check, gray = delivered
                  <svg className="h-3.5 w-4" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 8l4 4 8-10" />
                    <path d="M9 12l3 3 10-13" />
                  </svg>
                )}
              </span>
            )}
          </div>
        </div>

        {menu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div className={`absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#1a2d5c]/95 text-sm shadow-2xl backdrop-blur-md ${mine ? "right-0" : "left-0"} bottom-full mb-2 min-w-[170px]`}>
              <button className="px-4 py-2.5 text-left text-white/95 hover:bg-white/10" onClick={() => { onReply(); setMenu(false); }}>Reply</button>
              {mine && m.body && (
                <button className="px-4 py-2.5 text-left text-white/95 hover:bg-white/10" onClick={() => { setEditing(true); setMenu(false); }}>Edit</button>
              )}
              {m.body && (
                <button className="px-4 py-2.5 text-left text-white/95 hover:bg-white/10" onClick={() => { onCopy(); setMenu(false); }}>Copy</button>
              )}
              <button className="px-4 py-2.5 text-left text-white/95 hover:bg-white/10" onClick={() => { setShowDetails(true); setMenu(false); }}>Details</button>
              {mine && (
                <button className="px-4 py-2.5 text-left text-[oklch(0.75_0.2_25)] hover:bg-white/10" onClick={() => { onDelete(); setMenu(false); }}>Delete</button>
              )}
              <button className="px-4 py-2.5 text-left text-white/60 hover:bg-white/10" onClick={() => setMenu(false)}>Cancel</button>
            </div>
          </>
        )}
        {showDetails && typeof document !== "undefined" && createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={() => setShowDetails(false)} />
            <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-[#15171c] p-5 text-white shadow-2xl">
              <h3 className="mb-3 text-base font-semibold">Message details</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-white/60">From</dt><dd className="font-medium">{mine ? "You" : "Them"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/60">Sent</dt><dd>{format(new Date(m.created_at), "PPp")}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/60">Status</dt><dd>{m.read_at ? "Read" : "Delivered"}</dd></div>
                {m.read_at && (
                  <div className="flex justify-between gap-4"><dt className="text-white/60">Read at</dt><dd>{format(new Date(m.read_at), "PPp")}</dd></div>
                )}
                {m.image_urls?.length ? (
                  <div className="flex justify-between gap-4"><dt className="text-white/60">Images</dt><dd>{m.image_urls.length}</dd></div>
                ) : null}
                {m.body ? (
                  <div className="pt-1"><dt className="mb-1 text-white/60">Message</dt><dd className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-white/5 p-2 text-[13px]">{m.body}</dd></div>
                ) : null}
              </dl>
              <button onClick={() => setShowDetails(false)} className="mt-4 w-full rounded-full bg-white py-2 text-sm font-semibold text-black">Close</button>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}


function ImageViewer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl animate-fade-in" onClick={onClose}>
      <button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-lg border-2 border-red-600 bg-black text-red-500 shadow-lg transition hover:bg-red-600 hover:text-black active:scale-95" style={{ marginTop: "env(safe-area-inset-top)" }}>
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
      <a
        href={url}
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute right-4 top-20 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Download"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
      </a>
      <img
        src={url}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[96vw] touch-manipulation select-none rounded-2xl object-contain"
        style={{ touchAction: "pinch-zoom" }}
      />
    </div>
  );
}
