import Link from 'next/link';
import FinancialSummary from './components/FinancialSummary';
import SourceHealth from './components/SourceHealth';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Centro de control</div>
          <h1>Tu dinero, organizado para decidir mejor</h1>
          <p className="subtitle">
            Control de movimientos, presupuestos y previsiones con una única fuente bancaria protegida y sin modificar nunca el original.
          </p>
        </div>
        <span className="badge">V1.1.0</span>
      </section>

      <SourceHealth />
      <FinancialSummary />

      <section className="grid grid-2 section-gap">
        <article className="card">
          <div className="card-heading-row">
            <div>
              <div className="eyebrow">Previsión</div>
              <h2 className="section-title">Próximos movimientos</h2>
            </div>
            <Link href="/prevision" className="text-link">Ver previsión</Link>
          </div>
          <div className="empty compact-empty">
            La detección de recurrencias se activará con el histórico sincronizado y validado.
          </div>
        </article>

        <article className="card">
          <div className="card-heading-row">
            <div>
              <div className="eyebrow">Control</div>
              <h2 className="section-title">Alertas financieras</h2>
            </div>
            <Link href="/movimientos" className="text-link">Revisar</Link>
          </div>
          <div className="empty compact-empty">
            Aquí aparecerán duplicados probables, movimientos pendientes y anomalías detectadas.
          </div>
        </article>
      </section>

      <section className="grid grid-3 section-gap">
        <Link href="/movimientos" className="card action-card">
          <div className="metric-label">Movimientos</div>
          <div className="action-title">Revisar operaciones</div>
          <p className="metric-note">Busca, filtra, categoriza y concilia tus movimientos.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/presupuestos" className="card action-card">
          <div className="metric-label">Presupuestos</div>
          <div className="action-title">Controlar el mes</div>
          <p className="metric-note">Asignación, gasto real y dinero disponible por categoría.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/prevision" className="card action-card">
          <div className="metric-label">Previsión</div>
          <div className="action-title">Mirar hacia delante</div>
          <p className="metric-note">Calendario financiero, saldo futuro y riesgos de liquidez.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
