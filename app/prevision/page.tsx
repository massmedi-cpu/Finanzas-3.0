import {
  applyRecurringPreferences,
  getLiquidityRisk,
  projectedNetChange,
  simulateScenario,
  type RecurringPattern,
} from '../../src/domain/forecast-engine';
import { buildForecastCalendar } from '../../src/domain/forecast-calendar-engine';
import { projectGoal } from '../../src/domain/goal-engine';
import { buildLongHorizonForecast, maxScenarioHorizonMonths } from '../../src/domain/long-horizon-engine';
import { assessGoalFundingCapacity, scenarioAverageMonthlyNet } from '../../src/domain/planning-capacity-engine';
import { getPrivateState, type FutureEventRecord, type ScenarioRecord } from '../../src/private-data/client';
import { getRecurringPreferences } from '../../src/private-data/recurring';
import { getNormalizedForecastInputs } from '../../src/normalized/analytics-client';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import PlanningManager, { type FutureEventView, type ScenarioView } from './PlanningManager';

export const dynamic = 'force-dynamic';

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const monthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function addDays(value: string, days: number): string { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function monthLabel(value: string): string { return monthFormatter.format(new Date(`${value}-01T12:00:00Z`)); }
function toFutureEventView(record: FutureEventRecord): FutureEventView { return { id: record.id, title: record.title, expectedDate: record.expected_date, amount: Number(record.amount) || 0, category: record.category || '', account: record.account || '', recurrence: record.recurrence, recurrenceEnd: record.recurrence_end || '', active: record.active !== false, notes: record.notes || '' }; }
function toScenarioView(record: ScenarioRecord): ScenarioView { return { id: record.id, name: record.name, incomeChangePct: Number(record.income_change_pct) || 0, expenseChangePct: Number(record.expense_change_pct) || 0, monthlyNetAdjustment: Number(record.monthly_net_adjustment) || 0, monthlySavingsAllocation: Number(record.monthly_savings_allocation) || 0, startingBalanceAdjustment: Number(record.starting_balance_adjustment) || 0, horizonMonths: Number(record.horizon_months) || 12, active: record.active !== false, notes: record.notes || '' }; }

export default async function PrevisionPage() {
  let dataError = false;
  let baseDate: string | null = null;
  let knownBalance = 0;
  let patterns: RecurringPattern[] = [];
  let forecast: ReturnType<typeof buildLongHorizonForecast>['movements'] = [];
  let forecastHorizonMonths = 12;
  let forecastHorizonDate: string | null = null;
  let futureEvents: FutureEventRecord[] = [];
  let scenarios: ScenarioRecord[] = [];
  let categories: string[] = [];
  let accounts: string[] = [];
  let recurringConfirmed = 0;
  let recurringIgnored = 0;
  let goalProjections: ReturnType<typeof projectGoal>[] = [];

  if (isGoogleSheetsConfigured()) {
    try {
      const [forecastInputs, state, recurringPreferences] = await Promise.all([
        getNormalizedForecastInputs(),
        getPrivateState(),
        getRecurringPreferences(),
      ]);
      futureEvents = state.futureEvents;
      scenarios = state.scenarios;
      baseDate = forecastInputs.baseDate || forecastInputs.state.maxDate;
      knownBalance = forecastInputs.state.accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
      recurringConfirmed = recurringPreferences.filter((preference) => preference.status === 'confirmed').length;
      recurringIgnored = recurringPreferences.filter((preference) => preference.status === 'ignored').length;
      patterns = applyRecurringPreferences(forecastInputs.patterns, recurringPreferences);
      categories = forecastInputs.categories;
      accounts = forecastInputs.state.accounts.map((account) => account.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
      if (baseDate) {
        forecastHorizonMonths = maxScenarioHorizonMonths(scenarios, 12);
        const longHorizon = buildLongHorizonForecast(patterns, futureEvents, baseDate, forecastHorizonMonths);
        forecast = longHorizon.movements;
        forecastHorizonDate = longHorizon.horizonDate;
        goalProjections = state.goals
          .filter((goal) => goal.active)
          .map((goal) => projectGoal({
            targetAmount: Number(goal.target_amount) || 0,
            currentAmount: Number(goal.current_amount) || 0,
            targetDate: goal.target_date || null,
            monthlyContribution: goal.monthly_contribution == null ? null : Number(goal.monthly_contribution),
            asOfDate: baseDate as string,
          }));
      }
    } catch {
      dataError = true;
    }
  }

  const horizons = baseDate ? [['30 días', addDays(baseDate, 30)], ['6 meses', addDays(baseDate, 183)], ['12 meses', addDays(baseDate, 365)]] as const : [];
  const upcoming = forecast.slice(0, 20);
  const risk = baseDate ? getLiquidityRisk(forecast, knownBalance) : null;
  const calendar = baseDate ? buildForecastCalendar(forecast, knownBalance, baseDate, Math.min(12, forecastHorizonMonths)) : [];
  const activeScenarios = baseDate ? scenarios.filter((scenario) => scenario.active).map((scenario) => {
    const projection = simulateScenario(forecast, knownBalance, baseDate as string, scenario);
    const monthlyNet = scenarioAverageMonthlyNet(forecast, baseDate as string, scenario);
    const goalCapacity = assessGoalFundingCapacity(goalProjections, monthlyNet);
    return { projection, goalCapacity };
  }) : [];
  const plannedCount = futureEvents.filter((event) => event.active).length;

  return (
    <main className="page">
      <section className="page-header"><div><div className="eyebrow">Previsión</div><h1>Anticipa los próximos meses</h1><p className="subtitle">Combina recurrencias detectadas y validadas por ti con pagos e ingresos que ya conoces. Después puedes probar escenarios sin modificar ningún dato bancario original.</p></div><div className="planning-counters">{patterns.length > 0 && <span className="badge">{patterns.length} recurrencias activas</span>}{recurringConfirmed > 0 && <span className="badge">{recurringConfirmed} confirmadas</span>}{plannedCount > 0 && <span className="badge">{plannedCount} planificados</span>}{baseDate && <span className="badge">Horizonte {forecastHorizonMonths} meses</span>}</div></section>
      {dataError ? <div className="status-panel status-danger"><div><div className="status-title">No se puede calcular una previsión segura</div><div className="status-copy">La previsión queda bloqueada si falta la fuente, tus ajustes privados o las preferencias recurrentes.</div></div></div> : !baseDate ? <section className="card"><div className="empty">La previsión se activará cuando exista histórico bancario sincronizado.</div></section> : <>
        <section className="grid grid-4">{horizons.map(([label, date]) => { const projected = knownBalance + projectedNetChange(forecast, date); return <article className="card" key={label}><div className="metric-label">Saldo proyectado · {label}</div><div className={`metric-value ${projected < 0 ? 'amount-negative' : ''}`}>{euro.format(projected)}</div><p className="metric-note">Hasta {date} · recurrentes validados + planificación explícita</p></article>; })}<article className={`card${risk?.firstNegativeDate ? ' risk-card' : ''}`}><div className="metric-label">Punto mínimo previsto</div><div className={`metric-value ${risk && risk.lowestBalance < 0 ? 'amount-negative' : ''}`}>{risk ? euro.format(risk.lowestBalance) : '—'}</div><p className="metric-note">{risk?.firstNegativeDate ? `Riesgo de saldo negativo desde ${risk.firstNegativeDate}` : risk?.lowestDate ? `Mínimo estimado el ${risk.lowestDate}` : 'Sin movimientos futuros suficientes'}</p></article></section>

        {calendar.length > 0 && <section className="card section-gap"><div className="card-heading-row"><div><div className="eyebrow">Calendario financiero</div><h2 className="section-title">Flujo y saldo por mes</h2></div><span className="badge">Próximos {calendar.length} meses</span></div><div className="forecast-calendar">{calendar.map((month) => <article className={`forecast-calendar-row${month.firstNegativeDate ? ' forecast-calendar-row-risk' : ''}`} key={month.month}><div className="forecast-calendar-cell forecast-calendar-month"><span>Mes</span><strong>{monthLabel(month.month)}</strong>{month.firstNegativeDate && <small className="forecast-calendar-risk-note">Saldo negativo desde {month.firstNegativeDate}</small>}</div><div className="forecast-calendar-cell"><span>Ingresos previstos</span><strong className="amount-positive">{euro.format(month.income)}</strong></div><div className="forecast-calendar-cell"><span>Gastos previstos</span><strong className="amount-negative">{euro.format(month.expenses)}</strong></div><div className="forecast-calendar-cell"><span>Neto</span><strong className={month.netCashFlow < 0 ? 'amount-negative' : 'amount-positive'}>{euro.format(month.netCashFlow)}</strong></div><div className="forecast-calendar-cell"><span>Saldo final</span><strong className={month.endingBalance < 0 ? 'amount-negative' : ''}>{euro.format(month.endingBalance)}</strong></div><div className="forecast-calendar-cell"><span>Movimientos</span><strong>{month.movementCount}{month.plannedCount > 0 ? ` · ${month.plannedCount} planificados` : ''}</strong></div></article>)}</div><p className="metric-note">El primer mes parte del saldo conocido en {baseDate}. Los meses siguientes arrastran el saldo proyectado del cierre anterior.</p></section>}

        {activeScenarios.length > 0 && <section className="card section-gap scenario-comparison"><div className="card-heading-row"><div><div className="eyebrow">Simulador what-if</div><h2 className="section-title">Comparativa de escenarios activos</h2></div><span className="badge">{activeScenarios.length} escenarios</span></div><div className="scenario-grid">{activeScenarios.map(({ projection: scenario, goalCapacity }) => <article className="scenario-card" key={scenario.scenarioId}><div className="row-title">{scenario.name}</div><div className="scenario-balance">{euro.format(scenario.projectedBalance)}</div><div className={`scenario-delta ${scenario.differenceVsBaseline < 0 ? 'amount-negative' : 'amount-positive'}`}>{scenario.differenceVsBaseline >= 0 ? '+' : ''}{euro.format(scenario.differenceVsBaseline)} frente al escenario base</div><div className="scenario-meta"><span>Horizonte</span><strong>{scenario.horizonDate}</strong></div><div className="scenario-meta"><span>Ahorro reservado</span><strong>{euro.format(scenario.savingsAllocated)}</strong></div><div className="scenario-meta"><span>Liquidez libre tras ahorro</span><strong>{euro.format(scenario.freeAfterSavings)}</strong></div>{goalCapacity.status !== 'no_due_goals' && <div className={`scenario-goal-capacity${goalCapacity.status === 'shortfall' ? ' scenario-goal-capacity-risk' : goalCapacity.status === 'tight' ? ' scenario-goal-capacity-tight' : ''}`}><span>Objetivos · horizonte del escenario</span><strong>{goalCapacity.status === 'covered' ? 'Cubiertos' : goalCapacity.status === 'tight' ? 'Margen ajustado' : 'Financiación insuficiente'}</strong><small className={goalCapacity.monthlyMargin < 0 ? 'amount-negative' : 'amount-positive'}>{goalCapacity.monthlyMargin >= 0 ? '+' : ''}{euro.format(goalCapacity.monthlyMargin)}/mes tras el ritmo requerido</small></div>}</article>)}</div><p className="metric-note scenario-capacity-note">Cada escenario usa movimientos generados hasta su horizonte configurado. El motor admite hasta 60 meses sin truncar los patrones mensuales.</p></section>}
        <section className="grid grid-2 section-gap"><article className="card"><div className="card-heading-row"><div><div className="eyebrow">Detalle inmediato</div><h2 className="section-title">Próximos movimientos esperados</h2></div><span className="badge">{forecast.length} hasta {forecastHorizonDate || '—'}</span></div>{upcoming.length === 0 ? <div className="empty compact-empty">No hay movimientos futuros suficientemente fiables todavía.</div> : <div className="stack forecast-list">{upcoming.map((movement) => <div className="row" key={movement.id}><div><div className="row-title">{movement.description}</div><div className="row-meta">{movement.expectedDate} · {movement.category || 'Sin categoría'} · {movement.source === 'planned' ? 'planificado por ti' : `confianza ${Math.round(movement.confidence * 100)}%`}</div></div><div className={`amount ${movement.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(movement.amount)}</div></div>)}</div>}</article><article className="card"><div className="eyebrow">Modelo</div><h2 className="section-title">Cómo se está calculando</h2><div className="stack"><div className="row"><div><div className="row-title">Recurrencias activas</div><div className="row-meta">Tus confirmaciones y correcciones tienen prioridad; las ignoradas salen de la previsión.</div></div><strong>{patterns.length}</strong></div><div className="row"><div><div className="row-title">Recurrencias ignoradas</div><div className="row-meta">Patrones detectados que has decidido no proyectar.</div></div><strong>{recurringIgnored}</strong></div><div className="row"><div><div className="row-title">Movimientos explícitos</div><div className="row-meta">Tienen prioridad sobre una recurrencia equivalente para evitar doble conteo.</div></div><strong>{plannedCount}</strong></div><div className="row"><div><div className="row-title">Traspasos y exclusiones</div><div className="row-meta">No se consideran ingreso ni gasto en la previsión.</div></div><span className="state state-ok">Excluidos</span></div></div></article></section>
        <PlanningManager initialEvents={futureEvents.map(toFutureEventView)} initialScenarios={scenarios.map(toScenarioView)} categories={categories} accounts={accounts} />
      </>}
    </main>
  );
}
