import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import homeBg from "@/assets/home-watercolor.png.asset.json";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [pressed, setPressed] = useState(false);
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      // Preload — no auto-navigate; user must tap the button.
      void data;
    });
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setInstalled(standalone);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (installEvent) {
      installEvent.prompt();
      const res = await installEvent.userChoice;
      if (res?.outcome === "accepted") setInstalled(true);
      setInstallEvent(null);
      return;
    }
    setShowIosHint((v) => !v);
  }

  async function handleEnter() {
    if (pressed) return;
    setPressed(true);
    const { data } = await supabase.auth.getSession();
    setTimeout(() => {
      navigate({ to: data.session ? "/chat" : "/auth" });
    }, 500);
  }


  return (
    <main
      onClick={handleEnter}
      className="relative flex min-h-[100dvh] w-full cursor-pointer items-center justify-center overflow-hidden bg-cover bg-center"
      style={{ backgroundImage: `url(${homeBg.url})` }}
    >
      {/* Text baked into the artwork; keep semantic content for SEO/a11y */}
      <h1 className="sr-only">YouAndMe — A Private Space For Two</h1>
      <button
        onClick={handleEnter}
        aria-label="youandme — Tap to Start Our Conversation"
        className="absolute inset-0 h-full w-full"
      />

      {/* Beating heart-style YouAndMe button */}
      <button
        onClick={handleEnter}
        className="pointer-events-auto absolute bottom-[10%] z-10 flex items-center justify-center rounded-full px-8 py-4 font-kameron text-3xl font-semibold tracking-wide shadow-[0_0_40px_rgba(59,130,246,0.45)] backdrop-blur-md transition-transform active:scale-95 sm:bottom-[8%] sm:text-4xl animate-heartbeat"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.14) 100%)",
          border: "1px solid rgba(255,255,255,0.40)",
          color: "#2563EB",
          textShadow: "0 1px 2px rgba(255,255,255,0.8), 0 0 20px rgba(37,99,235,0.35)",
        }}
      >
        YouAndMe
      </button>

      {pressed && (
        <div className="pointer-events-none absolute inset-0 bg-black/10 transition-opacity" />
      )}
    </main>
  );
}
