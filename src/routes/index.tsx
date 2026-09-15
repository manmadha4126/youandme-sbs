import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import homeBg from "@/assets/home-watercolor.png";

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
      {pressed && (
        <div className="pointer-events-none absolute inset-0 bg-black/10 transition-opacity" />
      )}
    </main>
  );
}
