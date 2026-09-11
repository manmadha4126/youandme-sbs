import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import homeBg from "@/assets/home-watercolor.png.asset.json";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
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

  function handleEnter() {
    setPressed(true);
  }


  return (
    <main
      className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-cover bg-center"
      style={{ backgroundImage: `url(${homeBg.url})` }}
    >
      {/* Text baked into the artwork; keep semantic content for SEO/a11y */}
      <h1 className="sr-only">YouAndMe — A Private Space For Two</h1>

      {/* Only the baked-in "youandme" button area is tappable */}
      <Link
        to="/auth"
        onClick={handleEnter}
        aria-label="youandme — Tap to Start Our Conversation"
        className="absolute bottom-[12%] left-1/2 z-10 -translate-x-1/2 rounded-full px-10 py-3 text-lg font-semibold tracking-wide text-white shadow-lg backdrop-blur-md transition-transform active:scale-95"
        style={{
          background: "rgba(255, 255, 255, 0.25)",
          border: "1px solid rgba(255, 255, 255, 0.4)",
          animation: "heartbeat 1.6s ease-in-out infinite",
        }}
      >
        Tap to Start Our Conversation
      </button>

      {pressed && (
        <div className="pointer-events-none absolute inset-0 bg-black/10 transition-opacity" />
      )}

      <style>{`
        @keyframes heartbeat {
          0%, 100% { transform: translateX(-50%) scale(1); }
          14% { transform: translateX(-50%) scale(1.08); }
          28% { transform: translateX(-50%) scale(1); }
          42% { transform: translateX(-50%) scale(1.08); }
          70% { transform: translateX(-50%) scale(1); }
        }
      `}</style>
    </main>
  );
}
