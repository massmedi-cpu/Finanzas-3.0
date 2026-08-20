import Link from 'next/link';
import DashboardInsights from './components/DashboardInsights';
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
            Controla movimientos, presupuestos, recurrentes, objetivos y previsiones desde una copia privada sin modificar nunca la fuente bancaria original.
          </p>
        </div>
        <span className="badge">V1.5.0</span>
      </section>

      <SourceHealth />
      <FinancialSummary />
      <DashboardInsights />

      <section className="grid grid-3 section-gap">
        <Link href="/movimientos" className="card action-card">
          <div className="metric-label">Movimientos</div>
          <div className="action-title">Revisar operaciones</div>
          <p className="metric-note">Busca, edita, categoriza y concilia sin alterar la fuente.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/presupuestos" className="card action-card">
          <div className="metric-label">Presupuestos</div>
          <div className="action-title">Controlar el mes</div>
          <p className="metric-note">Asigna dinero y compara presupuesto con gasto real.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/recurrentes" className="card action-card">
          <div className="metric-label">Recurrentes</div>
          <div className="action-title">Validar lo que se repite</div>
          <p className="metric-note">Confirma recibos, suscripciones e ingresos y corrige su próxima fecha.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/prevision" className="card action-card">
          <div className="metric-label">Previsión</div>
          <div className="action-title">Mirar hacia delante</div>
          <p className="metric-note">Calendario futuro, riesgo de liquidez y simulador de escenarios.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/objetivos" className="card action-card">
          <div className="metric-label">Objetivos</div>
          <div className="action-title">Avanzar hacia tus metas</div>
          <p className="metric-note">Define importes, fechas y aportaciones mensuales.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/informes" className="card action-card">
          <div className="metric-label">Informes</div>
          <div className="action-title">Entender la evolución</div>
          <p className="metric-note">Compara ingresos, gastos y cash flow por mes y año.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
