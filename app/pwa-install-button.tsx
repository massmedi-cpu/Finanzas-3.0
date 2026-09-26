"use client";

import { useMemo, useState } from "react";
import { usePwaRuntime } from "./pwa-runtime";
import styles from "./pwa-install-button.module.css";

type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type InstallPlatform = "ios" | "chromium" | "other";

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

type Props = {
  className?: string;
  promptOnly?: boolean;
};

export function PwaInstallButton({ className, promptOnly = false }: Props) {
  const { canInstall, install, installed } = usePwaRuntime();
  const [showHelp, setShowHelp] = useState(false);
  const installPlatform = useMemo(() => platform(), []);
  const help = useMemo(() => instructions(installPlatform), [installPlatform]);

  if (installed || (promptOnly && !canInstall)) return null;

  const requestInstall = async () => {
    if (!canInstall) {
      setShowHelp(true);
      return;
    }

    const outcome = await install();
    if (!promptOnly && outcome !== "accepted") setShowHelp(true);
  };

  return (
    <>
      <button type="button" className={className} onClick={() => void requestInstall()} aria-label="Instalar Financial App en este dispositivo">
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
