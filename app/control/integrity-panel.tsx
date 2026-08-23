"use client";

import { useState } from "react";
import { formatInteger } from "@/lib/format/es-es";
import { INTEGRITY_CHECK_LABEL, INTEGRITY_STATUS_LABEL, shortFingerprint, summarizeIntegrityChecks, type IntegrityOverview } from "@/lib/financial/integrity-shared";

const dateTimeFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  dateStyle: "short",
  timeStyle: "short",
});

export function IntegrityPanel({ initialData }: { initialData: IntegrityOverview }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const current = data.current;
  const counts = summarizeIntegrityChecks(current.checks);

  async function reload() {
    const response = await fetch("/api/control/integrity", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "No se ha podido actualizar la integridad del sistema");
    setData(json);
  }

  async function runAudit() {
    if (!window.confirm("¿Ejecutar una auditoría profunda? Se calculará una huella de la fuente y se guardará un snapshot técnico en el historial.")) return;
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/control/integrity", { method: "POST", headers: { "Content-Type": "application/json" } });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "No se ha podido ejecutar la auditoría");
      await reload();
      setFeedback("Auditoría profunda completada y guardada. La fuente bancaria no se ha modificado.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se ha podido ejecutar la auditoría");
    } finally {
      setLoading(false);
    }
  }

  return <section className="integrity-panel" aria-labelledby="integrity-title">
    <div className="integrity-head">
      <div>
        <p className="eyebrow">INTEGRIDAD DEL SISTEMA · {current.version}</p>
        <h2 id="integrity-title">Auditoría técnica</h2>
        <p>Comprueba fuente, huellas, cuentas, sincronización, archivo privado y capas de edición sin modificar datos financieros.</p>
      </div>
      <div className={`integrity-status status-${current.status}`}>
        <strong>{INTEGRITY_STATUS_LABEL[current.status]}</strong>
        <span>{counts.pass} correctos · {counts.warning} avisos · {counts.fail} fallos</span>
      </div>
    </div>

    {feedback && <div className="integrity-feedback" role="status" aria-live="polite">{feedback}</div>}

    <div className="integrity-checks">
      {current.checks.map(check => <article key={check.key} className={`integrity-check check-${check.status}`}>
        <span className="integrity-check-icon" aria-hidden="true">{check.status === "pass" ? "✓" : check.status === "warning" ? "!" : "×"}</span>
        <div><strong>{check.label}</strong><p>{check.detail}</p></div>
        <small>{INTEGRITY_CHECK_LABEL[check.status]}</small>
      </article>)}
    </div>

    <div className="integrity-metrics" aria-label="Métricas técnicas">
      <article><span>Movimientos protegidos</span><strong>{formatInteger(current.source.transactions)}</strong><small>Conservados en Financial App</small></article>
      <article><span>Cuentas activas</span><strong>{formatInteger(current.infrastructure.activeAccounts)}</strong><small>{current.infrastructure.archivePrivate ? "Archivo privado" : "Revisar archivo"}</small></article>
      <article><span>Historial privado</span><strong>{formatInteger(current.privateLayers.historyRows)}</strong><small>Cambios trazables</small></article>
      <article><span>Huella estructural</span><strong className="mono-value">{shortFingerprint(current.fingerprint)}</strong><small>Comprobación rápida</small></article>
    </div>

    <div className="integrity-actions">
      <p>La comprobación visible al abrir Control es de solo lectura. La auditoría profunda es la única acción que guarda un registro técnico.</p>
      <button className="primary-action" type="button" onClick={runAudit} disabled={loading}>{loading ? "Auditando…" : "Ejecutar auditoría profunda"}</button>
    </div>

    <div className="integrity-history">
      <div className="integrity-history-head"><div><p className="eyebrow">HISTORIAL</p><h3>Auditorías guardadas</h3></div><span className="pill">{data.history.length} registros</span></div>
      {!data.history.length ? <p className="muted-copy">Todavía no hay auditorías profundas guardadas.</p> : <div className="integrity-history-list">
        {data.history.map(audit => <article key={audit.id}>
          <div><strong>{dateTimeFmt.format(new Date(audit.createdAt))}</strong><small>{INTEGRITY_STATUS_LABEL[audit.status]}</small></div>
          <div><span>Estado</span><code>{shortFingerprint(audit.fingerprint)}</code></div>
          <div><span>Fuente</span><code>{shortFingerprint(audit.sourceChecksum)}</code></div>
        </article>)}
      </div>}
    </div>
  </section>;
}
