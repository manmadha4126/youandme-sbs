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
    let session = null as any;
    try {
      const res: any = await Promise.race([
        supabase.auth.getSession(),
        new Promise((r) => setTimeout(() => r({ data: { session: null } }), 800)),
      ]);
      session = res?.data?.session ?? null;
    } catch {
      session = null;
    }
    navigate({ to: session ? "/chat" : "/auth" });
  }



  return (
    <main
      onClick={handleEnter}
      className="relative flex min-h-[100dvh] w-full cursor-pointer items-center justify-center overflow-hidden"
      style={{ backgroundColor: "#F7EFE7" }}
    >
      <h1 className="sr-only">YouAndMe — A Private Space For Two</h1>

      {/* Artwork shown in full, never cropped */}
      <div
        className="relative w-full"
        style={{ aspectRatio: "1866 / 843", maxHeight: "100dvh", maxWidth: "min(100vw, calc(100dvh * 1866 / 843))" }}
      >
        <img
          src={homeBg.url}
          alt="Watercolor artwork of two people forming a heart"
          className="absolute inset-0 h-full w-full object-contain"
        />

        {/* Beating button placed exactly over the artwork's call to action */}
        <button
          onClick={handleEnter}
          aria-label="YouAndMe — Tap to Start Our Conversation"
          className="animate-heartbeat absolute left-1/2 top-[70.8%] z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-[3.5%] py-[1.6%] font-kameron text-[clamp(14px,2.2vw,30px)] font-semibold tracking-wide backdrop-blur-md transition-transform active:scale-95"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,236,240,0.62) 100%)",
            border: "1px solid rgba(255,255,255,0.85)",
            color: "#2563EB",
            boxShadow: "0 8px 30px rgba(37,99,235,0.25)",
          }}
        >
          YouAndMe
        </button>
      </div>

      {pressed && (
        <div className="pointer-events-none absolute inset-0 bg-black/10 transition-opacity" />
      )}
    </main>
  );
}

