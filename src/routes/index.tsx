import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import homeBg from "@/assets/home-watercolor-restored.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "YouAndMe — A Private Space for Two" },
      { name: "description", content: "Enter YouAndMe, a private space for two to share messages and moments." },
      { property: "og:title", content: "YouAndMe — A Private Space for Two" },
      { property: "og:description", content: "Enter YouAndMe, a private space for two to share messages and moments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
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
      style={{ backgroundImage: `url("${homeBg.url}")` }}
      className="relative flex min-h-[100dvh] w-full cursor-pointer items-center justify-center overflow-hidden bg-background bg-cover bg-center bg-no-repeat max-sm:bg-[length:auto_100%]"
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
