"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./pwa-install-button.module.css";

type InstallOutcome = "accepted" | "dismissed";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type InstallPlatform = "ios" | "chromium" | "other";

function alreadyInstalled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as NavigatorWithStandalone).standalone);
}

function platform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";
  const agent = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(agent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  if (/Chrome|Chromium|CriOS|EdgA|EdgiOS|SamsungBrowser/i.test(agent)) return "chromium";
  return "other";
}

function instructions(value: InstallPlatform) {
  if (value === "ios") {
    return {
      title: "Instalar Financial App en iPhone o iPad",
      steps: ["Abre el menú Compartir del navegador.", "Elige “Añadir a pantalla de inicio”.", "Mantén activado “Abrir como app” y pulsa Añadir."],
    };
  }
  if (value === "chromium") {
    return {
      title: "Instalar Financial App",
      steps: ["Abre el menú del navegador.", "Busca “Instalar aplicación” o “Añadir a pantalla de inicio”.", "Confirma la instalación para abrir Financial App como una app independiente."],
    };
  }
  return {
    title: "Añadir Financial App como aplicación",
    steps: ["Abre el menú del navegador.", "Busca la opción para instalar o añadir la web a la pantalla de inicio.", "Confirma que quieres abrirla como aplicación cuando el navegador lo permita."],
  };
}

export function PwaInstallButton({ className }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const installPlatform = useMemo(() => platform(), []);
  const help = useMemo(() => instructions(installPlatform), [installPlatform]);

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
      setShowHelp(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("load", registerServiceWorker);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!deferredPrompt) {
      setShowHelp(true);
      return;
    }
    const prompt = deferredPrompt;
    setDeferredPrompt(null);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome !== "accepted") {
      setDeferredPrompt(prompt);
      setShowHelp(true);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => void install()} aria-label="Instalar Financial App en este dispositivo">
        Instalar app
      </button>
      {showHelp ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowHelp(false);
        }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
            <div className={styles.heading}>
              <div>
                <span>APLICACIÓN INSTALABLE</span>
                <h2 id="pwa-install-title">{help.title}</h2>
              </div>
              <button type="button" className={styles.close} aria-label="Cerrar instrucciones de instalación" onClick={() => setShowHelp(false)}>×</button>
            </div>
            <ol className={styles.steps}>
              {help.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}
            </ol>
            <p className={styles.note}>No es un acceso directo normal: al instalarla, Financial App puede abrirse en modo independiente, sin la interfaz habitual del navegador.</p>
          </section>
        </div>
      ) : null}
    </>
  );
}
