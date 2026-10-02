"use client";

import { useState } from "react";
import { useVisualPreferences, type VisualDensity } from "../../visual-preferences";
import styles from "./appearance.module.css";

const DENSITIES: Array<{
  value: VisualDensity;
  title: string;
  description: string;
}> = [
  {
    value: "comfortable",
    title: "Cómoda",
    description: "Más aire entre bloques, filas y controles. Mantiene la misma escala tipográfica.",
  },
  {
    value: "compact",
    title: "Compacta",
    description: "Reduce espaciados y separación sin hacer la letra más pequeña ni perder áreas táctiles.",
  },
];

export default function AppearanceClient() {
  const { density, reduceMotion, ready, setDensity, setReduceMotion, reset } = useVisualPreferences();
  const [notice, setNotice] = useState("Preferencias visuales cargadas.");

  function changeDensity(value: VisualDensity) {
    setDensity(value);
    setNotice(`Densidad ${value === "compact" ? "compacta" : "cómoda"} activada.`);
  }

  function changeMotion(value: boolean) {
    setReduceMotion(value);
    setNotice(value ? "Reducir movimiento activado." : "Reducir movimiento desactivado.");
  }

  function resetPreferences() {
    reset();
    setNotice("Preferencias visuales restablecidas.");
  }

  return (
    <main className={`configuration-shell ${styles.page}`}>
      <section className="configuration-hero">
        <div>
          <p className="eyebrow">Configuración</p>
          <h1>Apariencia y accesibilidad</h1>
          <p className="hero-copy">
            Ajusta la densidad visual y el movimiento de la interfaz. Estas preferencias son locales del dispositivo y no modifican datos financieros.
          </p>
        </div>
      </section>

      <div className={styles.grid}>
        <section className={`config-panel ${styles.panel}`} aria-labelledby="density-title">
          <div className={styles.heading}>
            <div>
              <p className="panel-kicker">Densidad</p>
              <h2 id="density-title">Cómoda o compacta</h2>
            </div>
            <span className={styles.current} data-testid="density-current">
              {density === "compact" ? "Compacta" : "Cómoda"}
            </span>
          </div>

          <fieldset className={styles.options} disabled={!ready}>
            <legend className={styles.srOnly}>Selecciona densidad visual</legend>
            {DENSITIES.map((option) => (
              <label
                key={option.value}
                className={`${styles.option} ${density === option.value ? styles.selected : ""}`}
              >
                <input
                  type="radio"
                  name="density"
                  value={option.value}
                  checked={density === option.value}
                  onChange={() => changeDensity(option.value)}
                />
                <span className={styles.optionCopy}>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className={`config-panel ${styles.panel}`} aria-labelledby="motion-title">
          <div className={styles.heading}>
            <div>
              <p className="panel-kicker">Accesibilidad</p>
              <h2 id="motion-title">Reducir movimiento</h2>
            </div>
          </div>

          <label className={styles.switchRow}>
            <span className={styles.switchCopy}>
              <strong>Reducir movimiento</strong>
              <small>
                Desactiva animaciones decorativas, transiciones largas y desplazamientos suaves. También se respeta la preferencia del sistema operativo.
              </small>
            </span>
            <input
              type="checkbox"
              checked={reduceMotion}
              disabled={!ready}
              onChange={(event) => changeMotion(event.currentTarget.checked)}
              aria-describedby="motion-help"
              data-testid="reduce-motion-toggle"
            />
          </label>
          <p id="motion-help" className={styles.helper}>
            El feedback de estado y los cambios de contenido siguen siendo visibles aunque el movimiento se reduzca.
          </p>
        </section>

        <section className={`config-panel ${styles.preview}`} aria-labelledby="preview-title">
          <div className={styles.heading}>
            <div>
              <p className="panel-kicker">Vista previa</p>
              <h2 id="preview-title">Efecto real</h2>
            </div>
          </div>
          <div className={styles.previewRows} data-testid="density-preview">
            <div>
              <span>Último movimiento</span>
              <strong>1.234,56 €</strong>
            </div>
            <div>
              <span>Presupuesto mensual</span>
              <strong>850,00 €</strong>
            </div>
            <div>
              <span>Margen disponible</span>
              <strong>412,30 €</strong>
            </div>
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <p role="status" aria-live="polite" data-testid="appearance-notice">{notice}</p>
        <button type="button" className="secondary-button" disabled={!ready} onClick={resetPreferences}>
          Restablecer preferencias
        </button>
      </div>
    </main>
  );
}
