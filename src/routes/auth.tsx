import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
  }),
  component: AuthPage,
});

function isSafeNext(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//");
}

const USERS = [
  { username: "manmadha", label: "manmadha" },
  { username: "likhitha", label: "likhitha" },
];

function toEmail(username: string) {
  return `${username}@youandme.app`;
}

function AuthPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string>(USERS[0].username);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat", replace: true });
    });
    // Ensure the two accounts exist (idempotent)
    fetch("/api/public/seed", { method: "POST" }).catch(() => {});
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const email = toEmail(selected);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Wrong password. Try again.");
      return;
    }
    navigate({ to: "/chat", replace: true });
  }

  return (
    <main
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 py-10"
      style={{
        background: "linear-gradient(180deg, #4facfe 0%, #00f2fe 30%, #ff9a9e 70%, #fecfef 100%)",
      }}
    >
      <button
        type="button"
        aria-label="Back to home"
        onClick={() => navigate({ to: "/" })}
        className="absolute top-4 left-4 z-50 grid h-11 w-11 place-items-center rounded-full bg-white text-[oklch(0.45_0.22_300)] shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <ArrowLeft size={22} strokeWidth={2.5} />
      </button>

      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-[oklch(0.65_0.20_250)] opacity-40 blur-3xl animate-float-slow" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[oklch(0.70_0.20_15)] opacity-40 blur-3xl animate-float-slower" />
      </div>

      <form onSubmit={handleSubmit} className="glass relative z-10 w-full max-w-sm rounded-3xl p-8 shadow-[var(--shadow-soft)] animate-fade-up">
        <div className="mb-8 text-center">
          <h1 className="font-kameron text-4xl font-bold drop-shadow-lg">
            <span className="text-white">You</span>
            <span className="text-black">And</span>
            <span className="text-white">Me</span>
          </h1>
          <p className="mt-2 text-base font-extrabold text-white drop-shadow">Sign in to continue</p>
        </div>

        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-black">Who are you</label>
        <div className="mb-5 grid grid-cols-2 gap-2">
          {USERS.map((u) => (
            <button
              key={u.username}
              type="button"
              onClick={() => setSelected(u.username)}
              className={`rounded-2xl border px-4 py-3 text-sm font-medium capitalize transition-all duration-300 hover:scale-110 hover:shadow-[var(--shadow-glow)] ${
                selected === u.username
                  ? "border-transparent text-white shadow-[var(--shadow-glow)]"
                  : "border-white/25 bg-white/10 text-white hover:border-transparent hover:text-white"
              }`}
              style={
                selected === u.username
                  ? { backgroundImage: "var(--gradient-bubble)" }
                  : undefined
              }
              onMouseEnter={(e) => {
                if (selected !== u.username) {
                  e.currentTarget.style.backgroundImage = "var(--gradient-bubble)";
                }
              }}
              onMouseLeave={(e) => {
                if (selected !== u.username) {
                  e.currentTarget.style.backgroundImage = "";
                }
              }}
            >
              {u.label}
            </button>
          ))}
        </div>

        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-black">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
          className="w-full rounded-2xl border border-white/25 bg-white/10 px-4 py-3 text-base text-white placeholder-white/50 outline-none transition focus:border-white/60 focus:bg-white/20"
        />

        {error && <p className="mt-3 text-sm text-[oklch(0.35_0.2_25)]">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password}
          className="mt-6 flex w-full items-center justify-center rounded-full py-3.5 text-base font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundImage: "var(--gradient-bubble)" }}
        >
          {loading ? "Entering…" : "Enter"}
        </button>

        <p className="mt-6 text-center text-xs font-semibold text-white">
          Your password is your name (lowercase).
        </p>
      </form>
    </main>
  );
}

