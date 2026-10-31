"use client";

import { useState } from "react";
import { useProductPreferences } from "../../product-preferences";

export default function PreferencesClient() {
  const {
    budgetFocus,
    syncOnOpen,
    privacyOnBlur,
    homeDestination,
    lastAutomaticSyncAt,
    setBudgetFocus,
    setSyncOnOpen,
    setPrivacyOnBlur,
    setHomeDestination,
    reset,
  } = useProductPreferences();
  const [notice, setNotice] = useState("Preferencias de producto cargadas.");

  const change = (action: () => void, message: string) => {
    action();
    setNotice(message);
  };

  return (
    <main className="configuration-shell">
      <section className="configuration-hero">
        <div>
          <p className="eyebrow">Configuración · Preferencias</p>
          <h1>Preferencias generales</h1>
          <p className="hero-copy">Elige cómo quieres ver tus datos. Fechas e importes se muestran en español de España y euros.</p>
        </div>
      </section>

      <div className="configuration-grid">
        <section className="config-panel">
          <p className="panel-kicker">Presupuestos</p>
          <fieldset className="preference-radio-group"><legend>Vista por defecto</legend>
          <label><input type="radio" name="budget-focus" value="all" checked={budgetFocus === "all"} onChange={() => change(() => setBudgetFocus("all"), "Presupuestos mostrará todas las categorías.")} /> Todas las categorías</label>
          <label><input type="radio" name="budget-focus" value="attention" checked={budgetFocus === "attention"} onChange={() => change(() => setBudgetFocus("attention"), "Presupuestos priorizará categorías que requieren atención.")} /> Solo categorías con exceso o sin financiación</label>
          </fieldset>
        </section>

        <section className="config-panel">
          <p className="panel-kicker">Sincronización</p>
          <h2>Fuente bancaria al abrir</h2>
          <label><input type="checkbox" checked={syncOnOpen} onChange={(event) => change(() => setSyncOnOpen(event.currentTarget.checked), event.currentTarget.checked ? "Sincronización automática al abrir activada." : "Sincronización automática al abrir desactivada.")} /> Intentar sincronizar una vez por sesión</label>
          <p>Actualiza los movimientos desde Google sin modificar el archivo original.</p>
          {lastAutomaticSyncAt ? <small>Última sincronización automática de esta sesión: {new Date(lastAutomaticSyncAt).toLocaleString("es-ES")}</small> : null}
        </section>

        <section className="config-panel">
          <p className="panel-kicker">Privacidad visual</p>
          <h2>Proteger al cambiar de ventana</h2>
          <label><input type="checkbox" checked={privacyOnBlur} onChange={(event) => change(() => setPrivacyOnBlur(event.currentTarget.checked), event.currentTarget.checked ? "Protección visual activada." : "Protección visual desactivada.")} /> Ocultar la app cuando pierde el foco</label>
          <p>Al cambiar a otra ventana o pestaña, una capa opaca protege los datos hasta volver a Financial App.</p>
        </section>

        <section className="config-panel">
          <p className="panel-kicker">Inicio</p>
          <h2>Página inicial al abrir</h2>
          <select aria-label="Página inicial al abrir" value={homeDestination} onChange={(event) => change(() => setHomeDestination(event.currentTarget.value as "/" | "/analysis" | "/forecast"), "Página inicial actualizada para el próximo arranque de sesión.")}>
            <option value="/">Inicio</option>
            <option value="/analysis">Análisis</option>
            <option value="/forecast">Previsión</option>
          </select>
          <p>Se aplica una sola vez al comenzar una sesión. Después puedes navegar a Inicio normalmente sin redirecciones inesperadas.</p>
        </section>
      </div>

      <section className="config-panel">
        <p className="panel-kicker">Formato regional</p>
        <h2>Español (España) · EUR</h2>
        <p>Formato: día/mes/año e importes en euros.</p>
      </section>

      <div className="configuration-footer">
        <p role="status" aria-live="polite">{notice}</p>
        <button type="button" className="secondary-button" onClick={() => { reset(); setNotice("Preferencias generales restablecidas."); }}>Restablecer preferencias</button>
      </div>
    </main>
  );
}
