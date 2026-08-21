import Link from 'next/link';
import { summarizeBudget, type BudgetEnvelope } from '../../src/domain/budget-engine';
import type { CategorySpending } from '../../src/domain/category-analysis';
import { applyRecurringPreferences, buildForecast, combineForecasts, expandPlannedEvents, getLiquidityRisk } from '../../src/domain/forecast-engine';
import { buildFinancialInsights } from '../../src/domain/insight-engine';
import { getPrivateState } from '../../src/private-data/client';
import { getRecurringPreferences } from '../../src/private-data/recurring';
import { getNormalizedPlan } from '../../src/normalized/analytics-client';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { APP_VERSION_LABEL } from '../../src/version';
import NetWorthChart from './NetWorthChart';

export const dynamic = 'force-dynamic';

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const percent = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function severityLabel(severity: 'positive' | 'info' | 'warning' | 'critical'): string {
  if (severity === 'positive') return 'Bien';
  if (severity === 'warning') return 'Atención';
  if (severity === 'critical') return 'Prioridad';
  return 'Dato';
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  let sourceError = false;

  if (!isGoogleSheetsConfigured()) {
    return <main className="page"><section className="page-header"><div><div className="eyebrow">Plan financiero</div><h1>Control mensual 360º</h1><p className="subtitle">El plan se activará cuando exista una fuente bancaria válida.</p></div><span className="badge">{APP_VERSION_LABEL}</span></section><section className="card"><div className="empty">Conecta la fuente bancaria para construir el plan con datos reales.</div></section></main>;
  }

  try {
    const [planData, privateState, recurringPreferences] = await Promise.all([
      getNormalizedPlan(params.month),
      getPrivateState(),
      getRecurringPreferences(),
    ]);

    const selectedMonth = planData.core.selectedMonth || planData.budget.selectedMonth || '';
    const availableMonths = planData.budget.availableMonths;
    const currentSummary = planData.core.current || { income: 0, expenses: 0, netCashFlow: 0, transactionCount: 0, needsReview: 0 };
    const previousSummary = planData.core.previous || { income: 0, expenses: 0, netCashFlow: 0, transactionCount: 0, needsReview: 0 };
    const envelopes: BudgetEnvelope[] = planData.budget.rows.map((row) => {
      const spent = Number(row.spent) || 0;
      const assigned = Number(row.assigned) || 0;
      const carryIn = Number(row.carryIn) || 0;
      return {
        category: row.category,
        spent,
        transactions: row.transactions || 0,
        assigned,
        carryIn,
        available: assigned + carryIn - spent,
        rollover: row.rollover,
      };
    });
    const budgetSummary = summarizeBudget(envelopes);
    const unassigned = currentSummary.income - budgetSummary.assigned;
    const topEnvelope = envelopes.reduce<BudgetEnvelope | null>((top, envelope) => !top || envelope.spent > top.spent ? envelope : top, null);
    const topCategory: CategorySpending | null = topEnvelope && topEnvelope.spent > 0 ? { category: topEnvelope.category, amount: topEnvelope.spent, transactions: topEnvelope.transactions } : null;

    const pendingReview = planData.core.pendingReview;
    const duplicateGroups = planData.core.duplicateGroups;

    const latestDate = planData.forecastInputs.baseDate || planData.state.maxDate || '';
    const patterns = applyRecurringPreferences(planData.forecastInputs.patterns, recurringPreferences);
    const forecast = latestDate ? combineForecasts(buildForecast(patterns, latestDate, 120), expandPlannedEvents(privateState.futureEvents, latestDate, 120)) : [];
    const startingBalance = planData.state.accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
    const liquidity = getLiquidityRisk(forecast, startingBalance);
    const upcoming = forecast.slice(0, 6);

    const netWorthHistory = planData.core.netWorthHistory;
    const latestNetWorth = netWorthHistory.at(-1) ?? null;
    const previousNetWorth = netWorthHistory.length > 1 ? netWorthHistory.at(-2) ?? null : null;
    const netWorthChange = latestNetWorth && previousNetWorth ? latestNetWorth.netWorth - previousNetWorth.netWorth : null;

    const insights = buildFinancialInsights({ month: selectedMonth, current: currentSummary, previous: previousSummary.transactionCount > 0 ? previousSummary : null, budget: budgetSummary, topCategory, liquidity, pendingReview, duplicateGroups, netWorthChange });
    const savingsRate = currentSummary.income > 0 ? (currentSummary.netCashFlow / currentSummary.income) * 100 : null;
    const activeGoals = privateState.goals.filter((goal) => goal.active).slice(0, 4);

    return (
      <main className="page">
        <section className="page-header plan-header"><div><div className="eyebrow">Plan financiero</div><h1>Control mensual 360º</h1><p className="subtitle">Presupuesto, cash flow, patrimonio, previsión y alertas en una única vista construida únicamente con tus datos reales y tus ajustes privados.</p></div><span className="badge">{APP_VERSION_LABEL} · {selectedMonth}</span></section>
        <nav className="month-selector" aria-label="Seleccionar mes del plan">{availableMonths.slice(0, 12).map((month) => <Link key={month} href={`/plan?month=${month}`} prefetch={false} className={`month-chip${month === selectedMonth ? ' month-chip-active' : ''}`}>{month}</Link>)}</nav>
        <section className="grid grid-4">
          <article className="card"><div className="metric-label">Ingresos</div><div className="metric-value amount-positive">{euro.format(currentSummary.income)}</div><p className="metric-note">{currentSummary.transactionCount} movimientos del periodo</p></article>
          <article className="card"><div className="metric-label">Gastos</div><div className="metric-value amount-negative">{euro.format(currentSummary.expenses)}</div><p className="metric-note">Traspasos internos excluidos</p></article>
          <article className="card"><div className="metric-label">Cash flow</div><div className={`metric-value ${currentSummary.netCashFlow < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(currentSummary.netCashFlow)}</div><p className="metric-note">{savingsRate === null ? 'Sin tasa de ahorro calculable' : `Tasa de ahorro ${percent.format(savingsRate)}%`}</p></article>
          <article className="card"><div className="metric-label">Por asignar</div><div className={`metric-value ${unassigned < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(unassigned)}</div><p className="metric-note">Ingresos del mes menos sobres asignados</p></article>
        </section>
        <section className="grid grid-2 section-gap">
          <article className="card"><div className="card-heading-row"><div><div className="eyebrow">Presupuesto</div><h2 className="section-title">Estado de los sobres</h2></div><Link href={`/presupuestos?month=${selectedMonth}`} prefetch={false} className="text-link">Gestionar</Link></div><div className="plan-budget-grid"><div><span>Asignado</span><strong>{euro.format(budgetSummary.assigned)}</strong></div><div><span>Gastado</span><strong>{euro.format(budgetSummary.spent)}</strong></div><div><span>Remanente recibido</span><strong>{euro.format(budgetSummary.carryIn)}</strong></div><div className={budgetSummary.overspent > 0 ? 'plan-risk' : ''}><span>Sobregasto</span><strong>{euro.format(budgetSummary.overspent)}</strong></div></div>{envelopes.length > 0 && <div className="stack plan-envelope-list">{envelopes.slice(0, 5).map((envelope) => <div className="row" key={envelope.category}><div><div className="row-title">{envelope.category}</div><div className="row-meta">Asignado {euro.format(envelope.assigned + envelope.carryIn)} · gastado {euro.format(envelope.spent)}</div></div><strong className={envelope.available < 0 ? 'amount-negative' : 'amount-positive'}>{euro.format(envelope.available)}</strong></div>)}</div>}</article>
          <article className="card"><div className="card-heading-row"><div><div className="eyebrow">Próximos 120 días</div><h2 className="section-title">Liquidez prevista</h2></div><Link href="/prevision" prefetch={false} className="text-link">Abrir previsión</Link></div><div className={`liquidity-banner${liquidity.firstNegativeDate ? ' liquidity-banner-risk' : ''}`}><span>{liquidity.firstNegativeDate ? 'Primera fecha bajo cero' : 'Mínimo proyectado'}</span><strong>{liquidity.firstNegativeDate || euro.format(liquidity.lowestBalance)}</strong></div>{upcoming.length === 0 ? <div className="empty compact-empty">No hay movimientos futuros suficientemente fiables.</div> : <div className="stack plan-upcoming-list">{upcoming.map((movement) => <div className="row" key={movement.id}><div><div className="row-title">{movement.description}</div><div className="row-meta">{movement.expectedDate} · {movement.source === 'planned' ? 'planificado' : `${Math.round(movement.confidence * 100)}% confianza`}</div></div><strong className={movement.amount < 0 ? 'amount-negative' : 'amount-positive'}>{euro.format(movement.amount)}</strong></div>)}</div>}</article>
        </section>
        <section className="card section-gap"><div className="card-heading-row"><div><div className="eyebrow">Patrimonio</div><h2 className="section-title">Evolución de los saldos conocidos</h2></div><Link href="/cuentas" prefetch={false} className="text-link">Ver cuentas</Link></div><div className="plan-networth-head"><div><span>Último patrimonio conocido</span><strong>{latestNetWorth ? euro.format(latestNetWorth.netWorth) : '—'}</strong></div><div><span>Cambio frente al cierre anterior</span><strong className={netWorthChange !== null && netWorthChange < 0 ? 'amount-negative' : 'amount-positive'}>{netWorthChange === null ? '—' : `${netWorthChange >= 0 ? '+' : ''}${euro.format(netWorthChange)}`}</strong></div></div><NetWorthChart points={netWorthHistory} /></section>
        <section className="grid grid-2 section-gap">
          <article className="card"><div className="card-heading-row"><div><div className="eyebrow">Análisis explicable</div><h2 className="section-title">Qué merece tu atención</h2></div><span className="badge">Sin inventar datos</span></div><div className="insight-list">{insights.length === 0 ? <div className="empty compact-empty">No hay suficientes datos para generar conclusiones fiables.</div> : insights.map((insight) => <div className={`insight insight-${insight.severity}`} key={insight.id}><div className="insight-top"><span>{severityLabel(insight.severity)}</span><strong>{insight.title}</strong></div><p>{insight.message}</p><small>Base: {insight.evidence}</small></div>)}</div></article>
          <article className="card"><div className="card-heading-row"><div><div className="eyebrow">Objetivos y calidad</div><h2 className="section-title">Cierre del mes</h2></div><Link href="/revision" prefetch={false} className="text-link">Revisar datos</Link></div><div className="alert-summary alert-summary-3"><div className="alert-stat"><strong>{pendingReview}</strong><span>pendientes</span></div><div className="alert-stat"><strong>{duplicateGroups}</strong><span>posibles duplicados</span></div><div className={`alert-stat${budgetSummary.overspent > 0 ? ' alert-stat-risk' : ''}`}><strong>{budgetSummary.overspent > 0 ? '!' : '✓'}</strong><span>{budgetSummary.overspent > 0 ? 'sobregasto en sobres' : 'presupuesto sin sobregasto'}</span></div></div><div className="stack plan-goal-list">{activeGoals.length === 0 ? <div className="empty compact-empty">No hay objetivos activos.</div> : activeGoals.map((goal) => { const target = Number(goal.target_amount) || 0; const current = Number(goal.current_amount) || 0; const progress = target > 0 ? Math.min(100, Math.max(0, current / target * 100)) : 0; return <div className="plan-goal" key={goal.id}><div className="row"><div><div className="row-title">{goal.name}</div><div className="row-meta">{euro.format(current)} de {euro.format(target)}{goal.target_date ? ` · ${goal.target_date}` : ''}</div></div><strong>{Math.round(progress)}%</strong></div><div className="progress"><span style={{ width: `${progress}%` }} /></div></div>; })}</div><Link href="/objetivos" prefetch={false} className="text-link plan-goal-link">Gestionar objetivos →</Link></article>
        </section>
      </main>
    );
  } catch {
    sourceError = true;
  }

  return <main className="page"><section className="page-header"><div><div className="eyebrow">Plan financiero</div><h1>Control mensual 360º</h1></div><span className="badge">{APP_VERSION_LABEL}</span></section>{sourceError && <div className="status-panel status-danger"><div><div className="status-title">No se puede construir el plan con garantías</div><div className="status-copy">La vista se detiene si falta la fuente, tus ajustes privados o las preferencias recurrentes.</div></div></div>}</main>;
}
