import Link from 'next/link';
import { APP_VERSION_LABEL } from '../src/version';
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
            Finanzas 3.0 reúne control mensual, movimientos, presupuestos, patrimonio, previsiones, objetivos e informes sobre una copia privada sin modificar nunca la fuente bancaria original.
          </p>
        </div>
        <span className="badge">{APP_VERSION_LABEL}</span>
      </section>

      <SourceHealth />
      <FinancialSummary />
      <DashboardInsights />

      <section className="grid grid-3 section-gap">
        <Link href="/plan" prefetch={false} className="card action-card action-card-primary">
          <div className="metric-label">Plan financiero</div>
          <div className="action-title">Control mensual 360º</div>
          <p className="metric-note">Presupuesto, cash flow, patrimonio, previsión, objetivos y análisis explicable en una sola vista.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/movimientos" prefetch={false} className="card action-card">
          <div className="metric-label">Movimientos</div>
          <div className="action-title">Editar y dividir operaciones</div>
          <p className="metric-note">Busca, categoriza, divide una compra entre varias categorías y concilia sin alterar la fuente.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/revision" prefetch={false} className="card action-card">
          <div className="metric-label">Calidad de datos</div>
          <div className="action-title">Resolver incidencias</div>
          <p className="metric-note">Comprueba duplicados, pendientes, categorías vacías e importes atípicos.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/presupuestos" prefetch={false} className="card action-card">
          <div className="metric-label">Presupuestos</div>
          <div className="action-title">Dar trabajo a cada euro</div>
          <p className="metric-note">Elige mes, asigna ingresos por sobres, controla lo libre y arrastra remanentes.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/recurrentes" prefetch={false} className="card action-card">
          <div className="metric-label">Recurrentes</div>
          <div className="action-title">Validar lo que se repite</div>
          <p className="metric-note">Confirma recibos, suscripciones e ingresos y corrige su próxima fecha.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/prevision" prefetch={false} className="card action-card">
          <div className="metric-label">Previsión</div>
          <div className="action-title">Mirar hacia delante</div>
          <p className="metric-note">Calendario futuro, riesgo de liquidez y simulador de escenarios.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/objetivos" prefetch={false} className="card action-card">
          <div className="metric-label">Objetivos</div>
          <div className="action-title">Avanzar hacia tus metas</div>
          <p className="metric-note">Define importes, fechas y aportaciones mensuales.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/informes" prefetch={false} className="card action-card">
          <div className="metric-label">Informes</div>
          <div className="action-title">Entender la evolución</div>
          <p className="metric-note">Cash flow anual, trimestres, categorías y comparativas entre años.</p>
          <span className="action-arrow" aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
