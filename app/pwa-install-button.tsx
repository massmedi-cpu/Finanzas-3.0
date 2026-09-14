"use client";

import { useEffect, useState } from "react";

type InstallOutcome = "accepted" | "dismissed";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function alreadyInstalled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as NavigatorWithStandalone).standalone);
}

export function PwaInstallButton({ className }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(alreadyInstalled());

    const registerServiceWorker = () => {
      if (!("serviceWorker" in navigator)) return;
      void navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }).catch(() => undefined);
    };

    if (document.readyState === "complete") registerServiceWorker();
    else window.addEventListener("load", registerServiceWorker, { once: true });

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("load", registerServiceWorker);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !deferredPrompt) return null;

  const install = async () => {
    const prompt = deferredPrompt;
    setDeferredPrompt(null);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome !== "accepted") setDeferredPrompt(prompt);
  };

  return (
    <button type="button" className={className} onClick={() => void install()} aria-label="Instalar Financial App en este dispositivo">
      Instalar app
    </button>
  );
}
