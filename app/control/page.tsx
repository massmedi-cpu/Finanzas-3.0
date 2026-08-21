import { buildSystemAuditChecks } from '../../src/domain/system-audit-engine';
import { getSystemAuditHistory, getSystemSnapshot } from '../../src/private-data/control-center';
import AuditCaptureButton from './AuditCaptureButton';

export const dynamic = 'force-dynamic';

function statusLabel(status: 'ok' | 'warning' | 'error') {
  return status === 'ok' ? 'Correcto' : status === 'warning' ? 'Atención' : 'Error';
}

export default async function ControlPage() {
  let dataError = false;
  let snapshot: Awaited<ReturnType<typeof getSystemSnapshot>> | null = null;
  let history: Awaited<ReturnType<typeof getSystemAuditHistory>> = [];
  try {
    [snapshot, history] = await Promise.all([getSystemSnapshot(), getSystemAuditHistory()]);
  } catch {
    dataError = true;
  }

  if (dataError || !snapshot) return <main className="page"><section className="page-header"><div><div className="eyebrow">Centro de control</div><h1>Audita el estado completo de Finanzas</h1></div></section><div className="status-panel status-danger"><div><div className="status-title">No se puede construir una auditoría fiable</div><div className="status-copy">La pantalla se detiene si falla la lectura normalizada o la capa privada de control.</div></div></div></main>;

  const checks = buildSystemAuditChecks(snapshot);
  return <main className="page">
    <section className="page-header">
      <div><div className="eyebrow">Centro de control</div><h1>Una sola verdad sobre el estado de la aplicación</h1><p className="subtitle">Comprueba sincronización, checksum, calidad, automatizaciones y capas privadas. Puedes guardar auditorías para comparar el estado antes y después de una versión.</p></div>
      <span className={`state state-${snapshot.status === 'ok' ? 'ok' : snapshot.status === 'warning' ? 'review' : 'danger'}`}>{statusLabel(snapshot.status)}</span>
    </section>

    <section className="grid grid-4">
      <article className="card"><div className="metric-label">Movimientos</div><div className="metric-value">{snapshot.state.normalizedRows.toLocaleString('es-ES')}</div><p className="metric-note">Snapshot {snapshot.state.currentRows.toLocaleString('es-ES')} · {snapshot.state.inSync ? 'sincronizado' : 'desincronizado'}</p></article>
      <article className="card"><div className="metric-label">Pendientes</div><div className="metric-value">{snapshot.quality.pending.toLocaleString('es-ES')}</div><p className="metric-note">Requieren revisión explícita.</p></article>
      <article className="card"><div className="metric-label">Duplicados candidatos</div><div className="metric-value">{snapshot.quality.duplicates.toLocaleString('es-ES')}</div><p className="metric-note">Grupos detectados por calidad.</p></article>
      <article className="card"><div className="metric-label">Reglas activas</div><div className="metric-value">{snapshot.automation.activeRules}</div><p className="metric-note">{snapshot.automation.suggestions} patrones candidatos sin automatizar.</p></article>
    </section>

    <section className="grid grid-2 section-gap">
      <article className="card"><div className="card-heading-row"><div><div className="eyebrow">Gates</div><h2 className="section-title">Controles estructurales</h2></div><span className="badge">{checks.length}</span></div><div className="audit-checks">{checks.map((check) => <div className={`audit-check audit-${check.severity}`} key={check.id}><div><strong>{check.title}</strong><p>{check.detail}</p></div><span>{statusLabel(check.severity)}</span></div>)}</div></article>
      <article className="card"><div className="eyebrow">Capa privada</div><h2 className="section-title">Trabajo que existe fuera de la fuente</h2><div className="audit-stats"><div><span>Overrides</span><strong>{snapshot.privateLayer.overrides}</strong></div><div><span>Movimientos divididos</span><strong>{snapshot.privateLayer.splitMovements}</strong></div><div><span>Meses cerrados</span><strong>{snapshot.privateLayer.closedMonths}</strong></div><div><span>Objetivos activos</span><strong>{snapshot.privateLayer.activeGoals}</strong></div><div><span>Filas de presupuesto</span><strong>{snapshot.privateLayer.budgetRows}</strong></div><div><span>Eventos futuros</span><strong>{snapshot.privateLayer.activeFutureEvents}</strong></div><div><span>Escenarios</span><strong>{snapshot.privateLayer.activeScenarios}</strong></div></div></article>
    </section>

    <section className="card section-gap"><div className="card-heading-row"><div><div className="eyebrow">Checkpoint</div><h2 className="section-title">Guardar auditoría del estado actual</h2></div><span className="badge">Checksum {(snapshot.state.currentChecksum || '—').slice(0, 12)}</span></div><AuditCaptureButton /><p className="metric-note">La captura guarda métricas y checksum; no duplica ni modifica movimientos.</p></section>

    <section className="card section-gap"><div className="card-heading-row"><div><div className="eyebrow">Historial</div><h2 className="section-title">Auditorías guardadas</h2></div><span className="badge">{history.length}</span></div>{history.length === 0 ? <div className="empty compact-empty">Aún no hay capturas guardadas.</div> : <div className="audit-history">{history.map((audit) => <article key={audit.id}><div><strong>{new Date(audit.captured_at).toLocaleString('es-ES')}</strong><p>{audit.note || 'Sin nota'} · {audit.current_rows.toLocaleString('es-ES')} filas · checksum {(audit.source_checksum || '—').slice(0, 12)}</p></div><span className={`origin origin-${audit.status === 'ok' ? 'source' : audit.status === 'warning' ? 'split' : 'manual'}`}>{statusLabel(audit.status)}</span></article>)}</div>}</section>
  </main>;
}
