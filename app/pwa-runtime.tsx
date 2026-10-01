"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type InstallOutcome = "accepted" | "dismissed";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type ServiceWorkerRegistrationWithSync = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

type PwaRuntimeValue = {
  canInstall: boolean;
  installed: boolean;
  online: boolean;
  install: () => Promise<InstallOutcome | "unavailable">;
};

const SAFE_REFRESH_SYNC_TAG = "financial-app-safe-refresh-v1";
const PwaRuntimeContext = createContext<PwaRuntimeValue | null>(null);

function alreadyInstalled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as NavigatorWithStandalone).standalone);
}

async function registerSafeRefresh(registration: ServiceWorkerRegistration) {
  const syncManager = (registration as ServiceWorkerRegistrationWithSync).sync;
  if (!syncManager) return;
  try {
    await syncManager.register(SAFE_REFRESH_SYNC_TAG);
  } catch {
    // Background Sync no está disponible en todos los navegadores. La ruta
    // alternativa se ejecuta con el evento `online` del cliente.
  }
}

export function PwaRuntimeProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const refreshInstalled = () => setInstalled(alreadyInstalled());
    const refreshOnline = () => setOnline(navigator.onLine);
    let active = true;

    refreshInstalled();
    refreshOnline();

    const registerServiceWorker = () => {
      if (!("serviceWorker" in navigator)) return;
      void navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }).then(async (registration) => {
        if (!active) return;
        await registration.update();
        if (!navigator.onLine) await registerSafeRefresh(registration);
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
    const onOffline = () => {
      setOnline(false);
      if (!("serviceWorker" in navigator)) return;
      void navigator.serviceWorker.ready.then(registerSafeRefresh).catch(() => undefined);
    };
    const onOnline = () => {
      setOnline(true);
      window.dispatchEvent(new Event("financial-app:source-revalidate"));
    };
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "FINANCIAL_APP_SAFE_REFRESH") {
        window.dispatchEvent(new Event("financial-app:source-revalidate"));
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    displayMode.addEventListener("change", refreshInstalled);
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

    return () => {
      active = false;
      window.removeEventListener("load", registerServiceWorker);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      displayMode.removeEventListener("change", refreshInstalled);
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    };
  }, []);

  const value = useMemo<PwaRuntimeValue>(() => ({
    canInstall: !installed && deferredPrompt !== null,
    installed,
    online,
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
  }), [deferredPrompt, installed, online]);

  return <PwaRuntimeContext.Provider value={value}>{children}</PwaRuntimeContext.Provider>;
}

export function usePwaRuntime() {
  const value = useContext(PwaRuntimeContext);
  if (!value) throw new Error("usePwaRuntime must be used within PwaRuntimeProvider");
  return value;
}
