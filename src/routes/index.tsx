import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      // Preload — no auto-navigate; user must tap the button.
      void data;
    });
  }, []);

  async function handleEnter() {
    if (pressed) return;
    setPressed(true);
    const { data } = await supabase.auth.getSession();
    setTimeout(() => {
      navigate({ to: data.session ? "/chat" : "/auth" });
    }, 500);
  }

  return (
    <main className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden px-6">
      {/* Floating glow orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[oklch(0.55_0.24_340)] opacity-40 blur-3xl animate-float-slow" />
        <div className="absolute top-1/2 -right-32 h-[28rem] w-[28rem] rounded-full bg-[oklch(0.45_0.22_300)] opacity-45 blur-3xl animate-float-slower" />
        <div className="absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-[oklch(0.65_0.22_15)] opacity-35 blur-3xl animate-float-slow" />
        {/* Particles */}
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-white/60 blur-[1px]"
            style={{
              top: `${(i * 53) % 100}%`,
              left: `${(i * 37) % 100}%`,
              animation: `float-slow ${8 + (i % 6)}s ease-in-out ${i * 0.3}s infinite`,
              opacity: 0.4 + ((i % 5) * 0.1),
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-10 text-center animate-fade-up">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.4em] text-white/60 animate-fade-in">a private space for two</p>
          <h1 className="font-display text-6xl font-bold text-gradient sm:text-7xl">youandme</h1>
        </div>

        <button
          onClick={handleEnter}
          className={`glass group relative flex items-center gap-3 rounded-full px-10 py-5 text-lg font-semibold tracking-wide text-white shadow-[var(--shadow-glow)] transition-all duration-500 hover:scale-105 active:scale-95 animate-pulse-glow ${pressed ? "scale-95 opacity-70" : ""}`}
          style={{ backgroundImage: "var(--gradient-bubble)" }}
        >
          <span>youandme</span>
          <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>

        <p className="text-xs text-white/40">tap to enter</p>
      </div>
    </main>
  );
}
