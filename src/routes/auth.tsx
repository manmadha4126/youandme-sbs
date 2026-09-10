import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  component: AuthPage,
});

function isSafeNext(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//");
}

const USERS: { username: string; emoji: string }[] = [
  { username: "manmadha", emoji: "👨" },
  { username: "likhitha", emoji: "👩" },
];

function toEmail(username: string) {
  return `${username}@youandme.app`;
}

// The UI asks for a 4-digit code; the stored password is derived from it.
function toPassword(pin: string) {
  return `ym-${pin.trim()}`;
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [selected, setSelected] = useState<string>(USERS[0].username);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goPostLogin = () => {
    if (next && isSafeNext(next)) {
      window.location.href = next;
    } else {
      navigate({ to: "/chat", replace: true });
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goPostLogin();
    });
    // Ensure the two accounts exist (idempotent)
    fetch("/api/public/seed", { method: "POST" }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const email = toEmail(selected);
    const { error } = await supabase.auth.signInWithPassword({ email, password: toPassword(password) });
    setLoading(false);
    if (error) {
      setError("Wrong code. Try again.");
      return;
    }
    goPostLogin();
  }

  return (
    <main
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 py-10"
      style={{
        background: "linear-gradient(180deg, #e8f5e9 0%, #f1f8e9 40%, #f9fbe7 70%, #e8f5e9 100%)",
      }}
    >
      {/* Organic green wave background */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 1440 900"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#81c784" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#66bb6a" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="waveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a5d6a7" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#81c784" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="waveGrad3" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4caf50" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#66bb6a" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        {/* Top-left flowing shape */}
        <path
          d="M-120,120 C120,20 320,260 520,160 C720,60 820,280 1020,180 C1180,100 1280,220 1380,140 L1380,-120 L-120,-120 Z"
          fill="url(#waveGrad1)"
        />
        {/* Mid-right soft blob */}
        <ellipse cx="1240" cy="220" rx="260" ry="200" fill="#c8e6c9" fillOpacity="0.35" />
        {/* Bottom-left wave */}
        <path
          d="M-120,820 C160,720 360,900 560,800 C760,700 960,880 1160,780 C1320,700 1420,820 1560,760 L1560,1020 L-120,1020 Z"
          fill="url(#waveGrad2)"
        />
        {/* Bottom-right layered wave */}
        <path
          d="M600,900 C800,820 1000,960 1200,860 C1340,790 1440,860 1560,820 L1560,1020 L600,1020 Z"
          fill="url(#waveGrad3)"
        />
        {/* Decorative circles */}
        <circle cx="180" cy="720" r="60" fill="#a5d6a7" fillOpacity="0.28" />
        <circle cx="1300" cy="680" r="40" fill="#81c784" fillOpacity="0.22" />
        <circle cx="90" cy="280" r="35" fill="#c8e6c9" fillOpacity="0.35" />
      </svg>

      <button
        type="button"
        aria-label="Back to home"
        onClick={() => navigate({ to: "/" })}
        className="absolute top-4 left-4 z-50 grid h-11 w-11 place-items-center rounded-full bg-white text-green-700 shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <ArrowLeft size={22} strokeWidth={2.5} />
      </button>

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-sm rounded-[2rem] p-8 animate-fade-up"
        style={{
          background: "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(20px) saturate(140%)",
          boxShadow: "0 25px 60px -20px rgba(46, 125, 50, 0.22), inset 0 0 0 1px rgba(255,255,255,0.6)",
        }}
      >
        <div className="mb-8 text-center">
          <h1 className="font-kameron text-5xl font-bold tracking-tight drop-shadow-sm">
            <span className="text-green-700">You</span>
            <span className="text-black">And</span>
            <span className="text-green-700">Me</span>
          </h1>
          <p className="mt-3 text-lg font-bold text-green-700">Sign in to continue</p>
        </div>

        <label className="mb-2 block text-sm font-extrabold uppercase tracking-widest text-black">Who are you</label>
        <div className="mb-5 grid grid-cols-2 gap-3">
          {USERS.map((u) => (
            <button
              key={u.username}
              type="button"
              onClick={() => setSelected(u.username)}
              className={`rounded-full border px-4 py-3 text-sm font-semibold capitalize transition-all duration-300 hover:scale-105 ${
                selected === u.username
                  ? "border-transparent bg-green-600 text-white shadow-lg shadow-green-700/25"
                  : "border-green-200 bg-white/80 text-green-800 hover:border-green-400 hover:bg-green-50"
              }`}
            >
              <span className="inline-flex items-center justify-center text-3xl leading-none">{u.emoji}</span>
            </button>
          ))}
        </div>

        <label className="mb-2 block text-sm font-extrabold uppercase tracking-widest text-black">4-digit code</label>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={password}
          onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          autoComplete="current-password"
          required
          className="w-full rounded-full border border-black bg-green-50/60 px-4 py-3.5 text-center text-lg tracking-[0.5em] text-black placeholder-green-300 outline-none transition focus:border-black focus:bg-green-50 focus:ring-2 focus:ring-black/30"
        />

        {error && <p className="mt-3 text-center text-sm font-semibold text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={loading || password.length !== 4}
          className="mt-6 flex w-full items-center justify-center rounded-full bg-green-600 py-3.5 text-base font-bold text-white shadow-lg shadow-green-700/30 transition-all hover:scale-[1.02] hover:bg-green-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Entering…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
