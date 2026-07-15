import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Phone, Video, MoreVertical } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { CallOverlay, type CallState } from "@/components/CallOverlay";

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
};

type Profile = { id: string; username: string; display_name: string };

const EMOJIS = ["❤️", "😂", "😍", "😘", "🥰", "😊", "😭", "🔥", "✨", "🌸", "💜", "💕", "😉", "😴", "🙈", "🌙", "☀️", "🎀"];

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
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
        setMessages((prev) => {
          const next = payload.new as Message;
          if (prev.some((m) => m.id === next.id)) return prev;
          return [...prev, next];
        });
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
        const row = payload.new as { user_id: string; last_seen: string };
        if (row && row.user_id !== userId) {
          const diff = Date.now() - new Date(row.last_seen).getTime();
          setOtherOnline(diff < 60_000);
        }
      })
      .subscribe();

    // Initial presence + typing status
    supabase.from("presence").select("*").then(({ data }) => {
      const other = data?.find((p) => p.user_id !== userId);
      if (other) setOtherOnline(Date.now() - new Date(other.last_seen).getTime() < 60_000);
    });
    supabase.from("typing_status").select("*").then(({ data }) => {
      const other = data?.find((t) => t.user_id !== userId);
      if (other) setOtherTyping(other.is_typing);
    });

    // Heartbeat my presence every 20s
    const beat = async () => {
      await supabase.from("presence").upsert({ user_id: userId, last_seen: new Date().toISOString() });
    };
    beat();
    const interval = setInterval(beat, 20_000);
    const onVisible = () => beat();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
      supabase.removeChannel(presenceChannel);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
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

  // Mark received messages as read
  useEffect(() => {
    if (!userId) return;
    const unread = messages.filter((m) => m.sender_id !== userId && !m.read_at);
    if (unread.length === 0) return;
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread.map((m) => m.id))
      .then(() => {});
  }, [messages, userId]);

  // Sign URLs for images (private bucket)
  useEffect(() => {
    const paths = new Set<string>();
    messages.forEach((m) => m.image_urls?.forEach((p) => { if (p && !signedUrls[p]) paths.add(p); }));
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
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("chat-images").upload(path, file, {
        cacheControl: "31536000",
        contentType: file.type,
      });
      if (!error) paths.push(path);
    }
    return paths;
  }

  async function sendMessage() {
    if (!userId) return;
    const body = text.trim();
    if (!body && pendingImages.length === 0) return;
    setUploading(true);
    setTyping(false);
    const imgs = pendingImages.length ? await uploadImages(pendingImages) : [];
    const { error } = await supabase.from("messages").insert({
      sender_id: userId,
      body: body || null,
      image_urls: imgs,
      reply_to_id: replyTo?.id ?? null,
    });
    if (!error) {
      setText("");
      setPendingImages([]);
      setReplyTo(null);
    }
    setUploading(false);
  }

  async function deleteMessage(id: string) {
    await supabase.from("messages").delete().eq("id", id);
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

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        height: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: `calc(env(safe-area-inset-bottom) + ${kbInset}px)`,
        background: "linear-gradient(120deg, #0d5c63 0%, #114b5f 25%, #1a2d5c 55%, #3d1f6b 85%, #5a2a8c 100%)",
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
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-semibold shadow-[var(--shadow-glow)]" style={{ backgroundImage: "var(--gradient-bubble)" }}>
          {otherProfile?.display_name?.[0] ?? "•"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-semibold leading-tight text-gradient">youandme</div>
          <div className="flex items-center gap-1.5 text-[11px] text-white/70">
            <span className={`h-2 w-2 rounded-full ${otherOnline ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/70" : "bg-white/30"}`} />
            <span className="truncate">
              {otherProfile ? (
                <>
                  <span className="font-semibold text-white">{otherProfile.display_name}</span>
                  <span className="text-white/60"> is {otherOnline ? (otherTyping ? "typing…" : "online") : "offline"}</span>
                </>
              ) : (
                <span className="text-white/60">{otherOnline ? "online" : "offline"}</span>
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
        <div className="relative sm:hidden">
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
              <span className="glass rounded-full px-3 py-1 text-[11px] uppercase tracking-widest text-white/60">{g.day}</span>
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
                />
              );
            })}
          </div>
        ))}

        {otherTyping && (
          <div className="flex justify-start">
            <div className="glass flex items-center gap-1 rounded-full px-4 py-2.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-white/70" style={{ animation: `typing-bounce 1.2s ${i * 0.15}s infinite` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Pending images preview */}
      {pendingImages.length > 0 && (
        <div className="glass flex gap-2 overflow-x-auto border-t border-white/10 px-3 py-2">
          {pendingImages.map((f, i) => {
            const url = URL.createObjectURL(f);
            return (
              <div key={i} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/20">
                <img src={url} alt="" className="h-full w-full object-cover" />
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
              {replyTo.body || (replyTo.image_urls?.length ? "📷 Photo" : "")}
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

      {/* Composer */}
      <div className="glass sticky bottom-0 z-20 flex items-end gap-2 border-t border-white/10 px-3 py-3">
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
              <div className="glass absolute bottom-full left-0 z-40 mb-2 flex min-w-[160px] flex-col overflow-hidden rounded-2xl border border-white/10 text-sm shadow-[var(--shadow-soft)]">
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left text-white/90 hover:bg-white/10"
                  onClick={() => { setShowAttach(false); cameraInputRef.current?.click(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Camera
                </button>
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left text-white/90 hover:bg-white/10"
                  onClick={() => { setShowAttach(false); fileInputRef.current?.click(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                  Gallery
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
            className="max-h-32 min-h-12 w-full resize-none rounded-3xl border border-white/20 px-4 py-3 pr-[104px] sm:pr-4 text-[15px] text-white placeholder-white/60 outline-none shadow-inner focus:border-white/40"
            style={{ backgroundImage: "linear-gradient(90deg, #0d5c63 0%, #3d1f6b 50%, #0d5c63 100%)" }}
          />
          {/* Mobile-only inline attach + emoji — vertically centered, larger */}
          <div className="sm:hidden absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
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
              <div className="glass absolute bottom-full right-0 z-40 mb-2 flex min-w-[160px] flex-col overflow-hidden rounded-2xl border border-white/10 text-sm shadow-[var(--shadow-soft)]">
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left text-white/90 hover:bg-white/10"
                  onClick={() => { setShowAttach(false); cameraInputRef.current?.click(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Camera
                </button>
                <button
                  className="flex items-center gap-3 px-4 py-3 text-left text-white/90 hover:bg-white/10"
                  onClick={() => { setShowAttach(false); fileInputRef.current?.click(); }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                  Gallery
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={sendMessage}
          disabled={uploading || (!text.trim() && pendingImages.length === 0)}
          aria-label="Send"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-black shadow-[var(--shadow-glow)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {uploading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
          )}
        </button>
      </div>

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
}) {
  const [menu, setMenu] = useState(false);
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

  const imgs = m.image_urls || [];
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
              : "rounded-bl-lg text-white glass"
          }`}
        >
          {parent && (
            <div className="mx-1 mt-1 flex gap-2 rounded-2xl border-l-[3px] border-[oklch(0.75_0.2_200)] bg-white/10 px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-[oklch(0.85_0.15_200)]">
                  {parentAuthor ?? "Message"}
                </div>
                <div className="truncate text-xs text-white/80">
                  {parent.body || (parent.image_urls?.length ? "📷 Photo" : "")}
                </div>
              </div>
            </div>
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
          {m.body && (
            <p className={`whitespace-pre-wrap break-words px-4 py-2 text-[15px] leading-snug ${imgs.length > 0 ? "pt-2" : ""}`}>
              {m.body}
            </p>
          )}
          <div className={`flex items-center justify-end gap-1 px-3 pb-2 pt-0.5 text-[10px] ${mine ? "text-white/80" : "text-white/50"}`}>
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
            <div className={`glass absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-white/10 text-sm shadow-[var(--shadow-soft)] ${mine ? "right-0" : "left-0"} top-full mt-2 min-w-[160px]`}>
              <button className="px-4 py-2.5 text-left text-white/90 hover:bg-white/10" onClick={() => { onReply(); setMenu(false); }}>Reply</button>
              {m.body && (
                <button className="px-4 py-2.5 text-left text-white/90 hover:bg-white/10" onClick={() => { onCopy(); setMenu(false); }}>Copy</button>
              )}
              {mine && (
                <button className="px-4 py-2.5 text-left text-[oklch(0.75_0.2_25)] hover:bg-white/10" onClick={() => { onDelete(); setMenu(false); }}>Delete</button>
              )}
              <button className="px-4 py-2.5 text-left text-white/60 hover:bg-white/10" onClick={() => setMenu(false)}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


function ImageViewer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl animate-fade-in" onClick={onClose}>
      <button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" style={{ marginTop: "env(safe-area-inset-top)" }}>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
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
