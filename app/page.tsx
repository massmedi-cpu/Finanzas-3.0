import "./cash-flow.css";
import { Suspense } from "react";
import { formatEuro, formatInteger } from "@/lib/format/es-es";
import { IntentLink } from "@/components/intent-link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getFinancialDashboard } from "@/lib/financial/dashboard";
import { getAccountsOverview } from "@/lib/financial/accounts";
import { getBudgetMonth } from "@/lib/financial/budget";
import { getForecastOverview } from "@/lib/financial/forecast";
import { getAnalysisOverview } from "@/lib/financial/analysis";
import { getHomeControlSummary,getHomeReconciliationSummary } from "@/lib/financial/home-streaming";
import { madridToday } from "@/lib/time/madrid";
import { SyncButton } from "@/components/sync-button";
import { APP_VERSION } from "@/lib/app-version";
import {
  HomeAccountsFallback,HomeAccountsSection,
  HomePulseSecondary,HomePulseSecondaryFallback,
  HomeFlowFallback,HomeFlowSection,
  HomeForecastFallback,HomeForecastSection,
  HomeDecisionFallback,HomeDecisionGrid,
} from "./home-sections";

const date=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"});
export const dynamic="force-dynamic";
function fmtDate(value:string|null|undefined){return value?date.format(new Date(`${value.slice(0,10)}T12:00:00`)):"—"}

export default async function Home(){
  await requireAuthorizedUser();

  // Todas las consultas secundarias arrancan antes de esperar al dashboard.
  // La respuesta HTML solo bloquea por el núcleo mensual; el resto se transmite
  // por límites Suspense independientes en cuanto cada bloque queda disponible.
  const today=madridToday();
  const year=Number(today.slice(0,4));
  const month=today.slice(0,7);
  const dashboardPromise=getFinancialDashboard();
  const accountsPromise=getAccountsOverview();
  const budgetPromise=getBudgetMonth(month);
  const forecastPromise=getForecastOverview(30);
  const analysisPromise=getAnalysisOverview(year);
  const reconciliationPromise=getHomeReconciliationSummary();
  const controlPromise=Promise.all([dashboardPromise,budgetPromise]).then(([dashboard,budget])=>getHomeControlSummary(dashboard,budget));

  const dashboard=await dashboardPromise;

  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace home-workspace">
    <header className="home-masthead"><div><p className="eyebrow">INICIO · {APP_VERSION}</p><h1>Panorama financiero</h1><p>Ritmo mensual, previsión y próximos movimientos conectados en una sola lectura.</p></div><div className="home-top-actions"><span>Último movimiento {fmtDate(dashboard.lastMovementDate)}</span><SyncButton/></div></header>

    <Suspense fallback={<HomeAccountsFallback/>}><HomeAccountsSection data={accountsPromise}/></Suspense>

    <section className="home-month-pulse" aria-label="Resumen del mes">
      <IntentLink href="/analisis"><span>Ingresos</span><strong className="positive">{formatEuro(dashboard.income)}</strong><small>reales computables</small></IntentLink>
      <IntentLink href="/presupuesto"><span>Gastos</span><strong className="negative">{formatEuro(dashboard.expenses)}</strong><small>gasto personal real</small></IntentLink>
      <IntentLink href="/cash-flow"><span>Cash Flow</span><strong className={dashboard.cashFlow<0?"negative":"positive"}>{formatEuro(dashboard.cashFlow)}</strong><small>sin ahorro ni traspasos</small></IntentLink>
      <IntentLink href="/movimientos?review=1"><span>Por revisar</span><strong>{formatInteger(dashboard.needsReview)}</strong><small>{dashboard.reviewSource}</small></IntentLink>
      <Suspense fallback={<HomePulseSecondaryFallback/>}><HomePulseSecondary reconciliation={reconciliationPromise} control={controlPromise}/></Suspense>
    </section>

    <Suspense fallback={<HomeFlowFallback/>}><HomeFlowSection analysis={analysisPromise} budget={budgetPromise}/></Suspense>
    <Suspense fallback={<HomeForecastFallback/>}><HomeForecastSection data={forecastPromise}/></Suspense>
    <Suspense fallback={<HomeDecisionFallback/>}><HomeDecisionGrid dashboard={dashboard} analysis={analysisPromise} budget={budgetPromise} reconciliation={reconciliationPromise} control={controlPromise}/></Suspense>

    <footer className="home-freshness"><span>Fuente oficial: Google Drive XLSX · solo lectura.</span><span>Última sincronización {dashboard.sync?.finishedAt?new Date(dashboard.sync.finishedAt).toLocaleString("es-ES"):"pendiente"}.</span></footer>
  </section></main>;
}
