export default function PrevisionPage() {
  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Previsión</div>
          <h1>Anticipa los próximos meses</h1>
          <p className="subtitle">La previsión utilizará exclusivamente ingresos, gastos y recurrencias reales detectadas en tus datos.</p>
        </div>
      </section>

      <section className="grid grid-3">
        {[
          ['Saldo en 30 días', '—'],
          ['Saldo en 6 meses', '—'],
          ['Saldo en 12 meses', '—'],
        ].map(([label, value]) => (
          <article className="card" key={label}>
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value}</div>
            <p className="metric-note">Pendiente de histórico suficiente</p>
          </article>
        ))}
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <article className="card">
          <h2 className="section-title">Calendario financiero</h2>
          <div className="empty">Aquí aparecerán próximos ingresos, recibos, suscripciones y pagos previstos.</div>
        </article>
        <article className="card">
          <h2 className="section-title">Riesgos de liquidez</h2>
          <div className="empty">Sin datos suficientes para detectar periodos de riesgo.</div>
        </article>
      </section>
    </main>
  );
}
