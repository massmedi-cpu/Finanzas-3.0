"use client";

import { usePwaRuntime } from "./pwa-runtime";

export function PwaInstallButton({ className }: { className?: string }) {
  const { canInstall, install, installed } = usePwaRuntime();

  if (installed || !canInstall) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={() => void install()}
      aria-label="Instalar Financial App en este dispositivo"
    >
      Instalar app
    </button>
  );
}
