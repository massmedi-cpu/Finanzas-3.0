export default function MovimientosPage() {
  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Movimientos</div>
          <h1>Operaciones bancarias</h1>
          <p className="subtitle">Consulta y revisa los movimientos importados sin modificar nunca la fuente original.</p>
        </div>
      </section>

      <div className="toolbar">
        <input className="control search" aria-label="Buscar movimientos" placeholder="Buscar por descripción, importe o categoría" />
        <select className="control" aria-label="Filtrar por cuenta" defaultValue="all">
          <option value="all">Todas las cuentas</option>
        </select>
        <select className="control" aria-label="Filtrar por estado" defaultValue="all">
          <option value="all">Todos los estados</option>
          <option value="confirmed">Confirmados</option>
          <option value="pending">Pendientes</option>
          <option value="review">Revisar</option>
        </select>
      </div>

      <section className="card">
        <div className="row">
          <div>
            <div className="row-title">Movimientos disponibles</div>
            <div className="row-meta">La lista se rellenará con la sincronización de la fuente maestra.</div>
          </div>
          <span className="badge">0 movimientos</span>
        </div>
        <div className="empty" style={{ marginTop: 16 }}>
          No hay datos bancarios sincronizados todavía. No se muestran movimientos ficticios.
        </div>
      </section>
    </main>
  );
}
