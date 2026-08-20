import Link from 'next/link';
import FinancialSummary from './components/FinancialSummary';

export default function Home() {
  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Centro de control</div>
          <h1>Tu situación financiera, clara y útil</h1>
          <p className="subtitle">
            Esta pantalla mostrará tus datos reales en cuanto la fuente bancaria quede sincronizada. No se usan cifras inventadas.
          </p>
        </div>
        <span className="badge">V1.1.0 · En construcción</span>
      </section>

      <FinancialSummary />

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <article className="card">
          <h2 className="section-title">Próximos movimientos</h2>
          <div className="empty">
            Todavía no hay movimientos futuros disponibles. La previsión se activará cuando existan datos sincronizados.
          </div>
        </article>

        <article className="card">
          <h2 className="section-title">Alertas</h2>
          <div className="empty">
            Sin alertas por ahora. Aquí aparecerán duplicados, gastos anómalos y riesgos de liquidez.
          </div>
        </article>
      </section>

      <section className="grid grid-3" style={{ marginTop: 16 }}>
        <Link href="/movimientos" className="card">
          <div className="metric-label">Movimientos</div>
          <div className="metric-value" style={{ fontSize: 22 }}>Revisar operaciones</div>
          <p className="metric-note">Buscar, filtrar, categorizar y revisar.</p>
        </Link>
        <Link href="/presupuestos" className="card">
          <div className="metric-label">Presupuestos</div>
          <div className="metric-value" style={{ fontSize: 22 }}>Control mensual</div>
          <p className="metric-note">Asignación, límites y dinero restante.</p>
        </Link>
        <Link href="/prevision" className="card">
          <div className="metric-label">Previsión</div>
          <div className="metric-value" style={{ fontSize: 22 }}>Mirar hacia delante</div>
          <p className="metric-note">Pagos, ingresos y saldo futuro.</p>
        </Link>
      </section>
    </main>
  );
}
