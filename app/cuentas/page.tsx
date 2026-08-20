export default function CuentasPage() {
  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Cuentas</div>
          <h1>Todo tu dinero, por cuenta</h1>
          <p className="subtitle">Saldo actual, saldo conciliado e historial de cada cuenta cuando los datos estén sincronizados.</p>
        </div>
      </section>

      <section className="grid grid-3">
        {['Cuenta corriente', 'Cuenta ahorro', 'Tarjetas y otros'].map((title) => (
          <article className="card" key={title}>
            <div className="metric-label">{title}</div>
            <div className="metric-value">—</div>
            <p className="metric-note">Pendiente de datos reales</p>
          </article>
        ))}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">Detalle de cuentas</h2>
        <div className="empty">No hay cuentas cargadas todavía. Se crearán a partir de la fuente de datos y de la configuración interna.</div>
      </section>
    </main>
  );
}
