import "./home.css";
import "./cash-flow.css";
import "./home-streaming.css";
import { Suspense } from "react";
import { formatEuro, formatInteger } from "@/lib/format/es-es";
import { IntentLink } from "@/components/intent-link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getHomePulse } from "@/lib/financial/home-pulse";
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

  // El pulso crítico excluye saldos/cuentas; esas lecturas arrancan en paralelo y se transmiten por Suspense.
  // Mostrar Inicio nunca dispara una sincronización de Drive ni un segundo refresh automático.
  const today=madridToday();
  const year=Number(today.slice(0,4));
  const month=today.slice(0,7);
  const pulsePromise=getHomePulse();
  const accountsPromise=getAccountsOverview();
  const budgetPromise=getBudgetMonth(month);
  const forecastPromise=getForecastOverview(30);
  const analysisPromise=getAnalysisOverview(year);
  const reconciliationPromise=getHomeReconciliationSummary();
  const controlPromise=Promise.all([pulsePromise,budgetPromise]).then(([pulse,budget])=>getHomeControlSummary(pulse,budget));

  const pulse=await pulsePromise;

  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace home-workspace">
    <header className="home-masthead"><div><p className="eyebrow">INICIO · {APP_VERSION}</p><h1>Panorama financiero</h1><p>Ritmo mensual, previsión y próximos movimientos conectados en una sola lectura.</p></div><div className="home-top-actions"><span>Último movimiento {fmtDate(pulse.lastMovementDate)}</span><SyncButton reconciliationPending={pulse.driveSync.reconciliationPending}/></div></header>

    <Suspense fallback={<HomeAccountsFallback/>}><HomeAccountsSection data={accountsPromise}/></Suspense>

    <section className="home-month-pulse" aria-label="Resumen del mes">
      <IntentLink href="/analisis"><span>Ingresos</span><strong className="positive">{formatEuro(pulse.income)}</strong><small>reales computables</small></IntentLink>
      <IntentLink href="/presupuesto"><span>Gastos</span><strong className="negative">{formatEuro(pulse.expenses)}</strong><small>gasto personal real</small></IntentLink>
      <IntentLink href="/cash-flow"><span>Cash Flow</span><strong className={pulse.cashFlow<0?"negative":"positive"}>{formatEuro(pulse.cashFlow)}</strong><small>sin ahorro ni traspasos</small></IntentLink>
      <IntentLink href="/movimientos?review=1"><span>Por revisar</span><strong>{formatInteger(pulse.needsReview)}</strong><small>{pulse.reviewSource}</small></IntentLink>
      <Suspense fallback={<HomePulseSecondaryFallback/>}><HomePulseSecondary reconciliation={reconciliationPromise} control={controlPromise}/></Suspense>
    </section>

    <Suspense fallback={<HomeFlowFallback/>}><HomeFlowSection analysis={analysisPromise} budget={budgetPromise}/></Suspense>
    <Suspense fallback={<HomeForecastFallback/>}><HomeForecastSection data={forecastPromise}/></Suspense>
    <Suspense fallback={<HomeDecisionFallback/>}><HomeDecisionGrid pulse={pulse} analysis={analysisPromise} budget={budgetPromise}/></Suspense>

    <footer className="home-freshness"><span>Fuente oficial: Google Drive XLSX · solo lectura.</span><span>Última sincronización {pulse.sync?.finishedAt?new Date(pulse.sync.finishedAt).toLocaleString("es-ES"):"pendiente"}.</span></footer>
  </section></main>;
}