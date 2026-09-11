import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import homeBg from "@/assets/home-art.png.asset.json";

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
      className="relative flex min-h-[100dvh] w-full cursor-pointer flex-col items-center justify-end overflow-hidden bg-cover bg-center bg-no-repeat pb-[14vh]"
      style={{ backgroundColor: "#F7EFE7", backgroundImage: `url(${homeBg.url})` }}
    >
      <p className="font-kameron text-xs font-semibold tracking-[0.35em] text-[#1E2A5A] sm:text-sm">
        A PRIVATE SPACE FOR TWO
      </p>
      <h1 className="mt-2 font-kameron text-4xl font-bold sm:text-6xl">
        <span className="text-[#C81E5A]">You</span>
        <span className="text-[#0F1B3D]">And</span>
        <span className="text-[#C81E5A]">Me</span>
      </h1>

      <button
        onClick={handleEnter}
        aria-label="YouAndMe — Tap to Start Our Conversation"
        className="animate-heartbeat mt-5 whitespace-nowrap rounded-full px-6 py-2 font-kameron text-lg font-semibold tracking-wide backdrop-blur-md transition-transform active:scale-95 sm:text-xl"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,236,240,0.62) 100%)",
          border: "1px solid rgba(255,255,255,0.85)",
          color: "#2563EB",
          boxShadow: "0 8px 30px rgba(37,99,235,0.25)",
        }}
      >
        YouAndMe
      </button>

      <p className="mt-4 font-kameron text-base font-medium text-[#1E2A5A] sm:text-lg">
        Tap to Start Our Conversation.
      </p>



      {pressed && (
        <div className="pointer-events-none absolute inset-0 bg-black/10 transition-opacity" />
      )}
    </main>
  );
}

