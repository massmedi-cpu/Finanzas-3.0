export default function Loading() {
  return (
    <main className="page" aria-live="polite" aria-busy="true">
      <section className="page-header">
        <div>
          <div className="eyebrow">Finanzas 3.0</div>
          <h1>Cargando información…</h1>
          <p className="subtitle">Preparando la vista solicitada sin modificar la fuente bancaria original.</p>
        </div>
        <span className="badge">Un momento</span>
      </section>

      <section className="grid grid-3 section-gap" aria-hidden="true">
        <div className="card"><div className="metric-label">Datos</div><div className="action-title">Actualizando vista</div></div>
        <div className="card"><div className="metric-label">Análisis</div><div className="action-title">Calculando</div></div>
        <div className="card"><div className="metric-label">Estado</div><div className="action-title">Validando</div></div>
      </section>
    </main>
  );
}
