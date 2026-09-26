"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type InstallOutcome = "accepted" | "dismissed";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

type PwaRuntimeValue = {
  canInstall: boolean;
  installed: boolean;
  install: () => Promise<InstallOutcome | "unavailable">;
};

const PwaRuntimeContext = createContext<PwaRuntimeValue | null>(null);

function alreadyInstalled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as NavigatorWithStandalone).standalone);
}

export function PwaRuntimeProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const refreshInstalled = () => setInstalled(alreadyInstalled());
    refreshInstalled();

    const registerServiceWorker = () => {
      if (!("serviceWorker" in navigator)) return;
      void navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }).then((registration) => registration.update()).catch(() => undefined);
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
    displayMode.addEventListener("change", refreshInstalled);

    return () => {
      window.removeEventListener("load", registerServiceWorker);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener("change", refreshInstalled);
    };
  }, []);

  const value = useMemo<PwaRuntimeValue>(() => ({
    canInstall: !installed && deferredPrompt !== null,
    installed,
    install: async () => {
      if (installed || !deferredPrompt) return "unavailable";
      const prompt = deferredPrompt;
      setDeferredPrompt(null);
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome !== "accepted") setDeferredPrompt(prompt);
        return choice.outcome;
      } catch {
        setDeferredPrompt(prompt);
        return "unavailable";
      }
    },
  }), [deferredPrompt, installed]);

  return <PwaRuntimeContext.Provider value={value}>{children}</PwaRuntimeContext.Provider>;
}

export function usePwaRuntime() {
  const value = useContext(PwaRuntimeContext);
  if (!value) throw new Error("usePwaRuntime must be used within PwaRuntimeProvider");
  return value;
}
