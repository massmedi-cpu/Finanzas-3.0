import "./home.css";
import "./home-sync.css";
import "./cash-flow-chart.css";
import "./home-streaming.css";
import { Suspense } from "react";
import { formatEuro, formatInteger } from "@/lib/format/es-es";
import { IntentLink } from "@/components/intent-link";
import { requireAuthorizedUser } from "@/lib/auth/require-user";
import { getHomePulse } from "@/lib/financial/home-pulse";
import { getAccountsOverview } from "@/lib/financial/accounts";
import { getBudgetMonth } from "@/lib/financial/budget";
import { getForecastLiquidity } from "@/lib/financial/forecast-liquidity";
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
const dateTime=new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Madrid"});
export const dynamic="force-dynamic";
function fmtDate(value:string|null|undefined){return value?date.format(new Date(`${value.slice(0,10)}T12:00:00`)):"—"}
function fmtDateTime(value:string|null|undefined){if(!value)return "pendiente";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?"pendiente":dateTime.format(parsed)}

export default async function Home(){
  await requireAuthorizedUser();
  const today=madridToday();
  const year=Number(today.slice(0,4));
  const month=today.slice(0,7);
  const pulsePromise=getHomePulse();
  const accountsPromise=getAccountsOverview();
  const budgetPromise=getBudgetMonth(month);
  const forecastPromise=getForecastLiquidity(30);
  const analysisPromise=getAnalysisOverview(year);
  const reconciliationPromise=getHomeReconciliationSummary();
  const controlPromise=Promise.all([pulsePromise,budgetPromise]).then(([pulse,budget])=>getHomeControlSummary(pulse,budget));
  const pulse=await pulsePromise;

  return <main className="app-shell"><section id="main-content" tabIndex={-1} className="workspace home-workspace">
    <header className="home-masthead"><div><p className="eyebrow">INICIO · {APP_VERSION}</p><h1>Panorama financiero</h1><p>Ritmo mensual, previsión y próximos movimientos conectados en una sola lectura.</p></div><div className="home-top-actions"><span>Último movimiento {fmtDate(pulse.lastMovementDate)}</span><div className="home-sync-action"><SyncButton reconciliationPending={pulse.driveSync.reconciliationPending} sourceModifiedAt={pulse.sync?.sourceModifiedAt} lastSyncAt={pulse.driveSync.lastSyncAt} autoSync/><small>Drive XLSX · datos {fmtDateTime(pulse.sync?.sourceModifiedAt)} · solo lectura · actualización inteligente</small></div></div></header>
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
    <Suspense fallback={<HomeDecisionFallback/>}><HomeDecisionGrid analysis={analysisPromise}/></Suspense>
  </section></main>;
}
