const categories = [
  ['Vivienda', 0],
  ['Alimentación', 0],
  ['Transporte', 0],
  ['Salud', 0],
  ['Tecnología', 0],
  ['Ocio', 0],
];

export default function PresupuestosPage() {
  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Presupuestos</div>
          <h1>Decide qué puede hacer cada euro</h1>
          <p className="subtitle">La asignación mensual se activará cuando exista dinero disponible y movimientos categorizados.</p>
        </div>
      </section>

      <section className="grid grid-3">
        <article className="card">
          <div className="metric-label">Asignado</div>
          <div className="metric-value">—</div>
          <p className="metric-note">Pendiente de configuración</p>
        </article>
        <article className="card">
          <div className="metric-label">Gastado</div>
          <div className="metric-value">—</div>
          <p className="metric-note">Pendiente de movimientos</p>
        </article>
        <article className="card">
          <div className="metric-label">Disponible</div>
          <div className="metric-value">—</div>
          <p className="metric-note">Se calculará automáticamente</p>
        </article>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">Categorías</h2>
        <div className="stack">
          {categories.map(([name]) => (
            <div className="row" key={name as string}>
              <div>
                <div className="row-title">{name}</div>
                <div className="row-meta">Sin presupuesto asignado</div>
              </div>
              <div style={{ minWidth: 150 }}>
                <div className="progress"><span style={{ width: '0%' }} /></div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
