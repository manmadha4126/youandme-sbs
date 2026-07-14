import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

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
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 py-10">
      <button
        type="button"
        aria-label="Back to home"
        onClick={() => navigate({ to: "/" })}
        className="absolute top-4 left-4 z-50 grid h-11 w-11 place-items-center rounded-full bg-white text-[oklch(0.45_0.22_300)] shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <ArrowLeft size={22} strokeWidth={2.5} />
      </button>

      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-[oklch(0.55_0.24_340)] opacity-40 blur-3xl animate-float-slow" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[oklch(0.45_0.22_300)] opacity-40 blur-3xl animate-float-slower" />
      </div>

      <form onSubmit={handleSubmit} className="glass relative z-10 w-full max-w-sm rounded-3xl p-8 shadow-[var(--shadow-soft)] animate-fade-up">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold text-gradient">youandme</h1>
          <p className="mt-2 text-sm text-white/60">Sign in to continue</p>
        </div>

        <label className="mb-2 block text-xs uppercase tracking-widest text-white/50">Who are you</label>
        <div className="mb-5 grid grid-cols-2 gap-2">
          {USERS.map((u) => (
            <button
              key={u.username}
              type="button"
              onClick={() => setSelected(u.username)}
              className={`rounded-2xl border px-4 py-3 text-sm font-medium capitalize transition-all ${
                selected === u.username
                  ? "border-transparent text-white shadow-[var(--shadow-glow)]"
                  : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
              style={selected === u.username ? { backgroundImage: "var(--gradient-bubble)" } : undefined}
            >
              {u.label}
            </button>
          ))}
        </div>

        <label className="mb-2 block text-xs uppercase tracking-widest text-white/50">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
          className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white placeholder-white/40 outline-none transition focus:border-white/40 focus:bg-white/10"
        />

        {error && <p className="mt-3 text-sm text-[oklch(0.75_0.2_25)]">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password}
          className="mt-6 flex w-full items-center justify-center rounded-full py-3.5 text-base font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundImage: "var(--gradient-bubble)" }}
        >
          {loading ? "Entering…" : "Enter"}
        </button>

        <p className="mt-6 text-center text-[11px] text-white/40">
          Only invited — no public sign-ups.
          <br />Your password is your name (lowercase).
        </p>
      </form>
    </main>
  );
}
