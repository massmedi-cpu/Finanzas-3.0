import {
  buildForecast,
  combineForecasts,
  detectRecurringPatterns,
  expandPlannedEvents,
  getLiquidityRisk,
  projectedNetChange,
  simulateScenario,
} from '../../src/domain/forecast-engine';
import { getNetWorthFromKnownBalances } from '../../src/domain/finance-engine';
import { getPrivateState, type FutureEventRecord, type ScenarioRecord } from '../../src/private-data/client';
import { rowsForAnalytics } from '../../src/private-data/merge';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';
import PlanningManager, { type FutureEventView, type ScenarioView } from './PlanningManager';

export const dynamic = 'force-dynamic';

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toFutureEventView(record: FutureEventRecord): FutureEventView {
  return {
    id: record.id,
    title: record.title,
    expectedDate: record.expected_date,
    amount: Number(record.amount) || 0,
    category: record.category || '',
    account: record.account || '',
    recurrence: record.recurrence,
    recurrenceEnd: record.recurrence_end || '',
    active: record.active !== false,
    notes: record.notes || '',
  };
}

function toScenarioView(record: ScenarioRecord): ScenarioView {
  return {
    id: record.id,
    name: record.name,
    incomeChangePct: Number(record.income_change_pct) || 0,
    expenseChangePct: Number(record.expense_change_pct) || 0,
    monthlyNetAdjustment: Number(record.monthly_net_adjustment) || 0,
    monthlySavingsAllocation: Number(record.monthly_savings_allocation) || 0,
    startingBalanceAdjustment: Number(record.starting_balance_adjustment) || 0,
    horizonMonths: Number(record.horizon_months) || 12,
    active: record.active !== false,
    notes: record.notes || '',
  };
}

export default async function PrevisionPage() {
  let sourceError = false;
  let baseDate: string | null = null;
  let knownBalance = 0;
  let patterns: ReturnType<typeof detectRecurringPatterns> = [];
  let forecast: ReturnType<typeof combineForecasts> = [];
  let futureEvents: FutureEventRecord[] = [];
  let scenarios: ScenarioRecord[] = [];
  let categories: string[] = [];
  let accounts: string[] = [];

  if (isGoogleSheetsConfigured()) {
    try {
      const source = await loadValidatedSource();
      let overrides: Awaited<ReturnType<typeof getPrivateState>>['overrides'] = [];
      try {
        const state = await getPrivateState();
        overrides = state.overrides;
        futureEvents = state.futureEvents;
        scenarios = state.scenarios;
      } catch {
        overrides = [];
        futureEvents = [];
        scenarios = [];
      }

      const analyticsRows = rowsForAnalytics(source.rows, overrides);
      baseDate = source.rows.reduce<string>((latest, row) => (row.date > latest ? row.date : latest), '');
      knownBalance = getNetWorthFromKnownBalances(source.rows);
      patterns = detectRecurringPatterns(analyticsRows);
      categories = [...new Set(analyticsRows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
      accounts = [...new Set(source.rows.map((row) => row.productOrAccount).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

      if (baseDate) {
        const detected = buildForecast(patterns, baseDate, 365);
        const planned = expandPlannedEvents(futureEvents, baseDate, 365);
        forecast = combineForecasts(detected, planned);
      }
    } catch {
      sourceError = true;
    }
  }

  const horizons = baseDate
    ? [['30 días', addDays(baseDate, 30)], ['6 meses', addDays(baseDate, 183)], ['12 meses', addDays(baseDate, 365)]] as const
    : [];
  const upcoming = forecast.slice(0, 20);
  const risk = baseDate ? getLiquidityRisk(forecast, knownBalance) : null;
  const activeScenarios = baseDate
    ? scenarios.filter((scenario) => scenario.active).map((scenario) => simulateScenario(forecast, knownBalance, baseDate as string, scenario))
    : [];
  const plannedCount = futureEvents.filter((event) => event.active).length;

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Previsión</div>
          <h1>Anticipa los próximos meses</h1>
          <p className="subtitle">Combina recurrencias detectadas en tu histórico con pagos e ingresos que tú ya conoces. Después puedes probar escenarios sin modificar ningún dato bancario original.</p>
        </div>
        <div className="planning-counters">
          {patterns.length > 0 && <span className="badge">{patterns.length} recurrencias</span>}
          {plannedCount > 0 && <span className="badge">{plannedCount} planificados</span>}
        </div>
      </section>

      {sourceError ? (
        <div className="status-panel status-danger"><div><div className="status-title">No se puede calcular una previsión segura</div><div className="status-copy">La previsión queda bloqueada hasta validar de nuevo la fuente.</div></div></div>
      ) : !baseDate ? (
        <section className="card"><div className="empty">La previsión se activará cuando exista histórico bancario sincronizado.</div></section>
      ) : (
        <>
          <section className="grid grid-4">
            {horizons.map(([label, date]) => {
              const projected = knownBalance + projectedNetChange(forecast, date);
              return <article className="card" key={label}><div className="metric-label">Saldo proyectado · {label}</div><div className={`metric-value ${projected < 0 ? 'amount-negative' : ''}`}>{euro.format(projected)}</div><p className="metric-note">Hasta {date} · recurrencias + planificación explícita</p></article>;
            })}
            <article className={`card${risk?.firstNegativeDate ? ' risk-card' : ''}`}>
              <div className="metric-label">Punto mínimo previsto</div>
              <div className={`metric-value ${risk && risk.lowestBalance < 0 ? 'amount-negative' : ''}`}>{risk ? euro.format(risk.lowestBalance) : '—'}</div>
              <p className="metric-note">{risk?.firstNegativeDate ? `Riesgo de saldo negativo desde ${risk.firstNegativeDate}` : risk?.lowestDate ? `Mínimo estimado el ${risk.lowestDate}` : 'Sin movimientos futuros suficientes'}</p>
            </article>
          </section>

          {activeScenarios.length > 0 && (
            <section className="card section-gap scenario-comparison">
              <div className="card-heading-row">
                <div><div className="eyebrow">Simulador what-if</div><h2 className="section-title">Comparativa de escenarios activos</h2></div>
                <span className="badge">{activeScenarios.length} escenarios</span>
              </div>
              <div className="scenario-grid">
                {activeScenarios.map((scenario) => (
                  <article className="scenario-card" key={scenario.scenarioId}>
                    <div className="row-title">{scenario.name}</div>
                    <div className="scenario-balance">{euro.format(scenario.projectedBalance)}</div>
                    <div className={`scenario-delta ${scenario.differenceVsBaseline < 0 ? 'amount-negative' : 'amount-positive'}`}>{scenario.differenceVsBaseline >= 0 ? '+' : ''}{euro.format(scenario.differenceVsBaseline)} frente al escenario base</div>
                    <div className="scenario-meta"><span>Horizonte</span><strong>{scenario.horizonDate}</strong></div>
                    <div className="scenario-meta"><span>Ahorro reservado</span><strong>{euro.format(scenario.savingsAllocated)}</strong></div>
                    <div className="scenario-meta"><span>Liquidez libre tras ahorro</span><strong>{euro.format(scenario.freeAfterSavings)}</strong></div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="grid grid-2 section-gap">
            <article className="card">
              <div className="card-heading-row"><div><div className="eyebrow">Calendario financiero</div><h2 className="section-title">Próximos movimientos esperados</h2></div><span className="badge">{forecast.length} en 12 meses</span></div>
              {upcoming.length === 0 ? <div className="empty compact-empty">No hay movimientos futuros suficientemente fiables todavía.</div> : (
                <div className="stack forecast-list">{upcoming.map((movement) => <div className="row" key={movement.id}><div><div className="row-title">{movement.description}</div><div className="row-meta">{movement.expectedDate} · {movement.category || 'Sin categoría'} · {movement.source === 'planned' ? 'planificado por ti' : `confianza ${Math.round(movement.confidence * 100)}%`}</div></div><div className={`amount ${movement.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(movement.amount)}</div></div>)}</div>
              )}
            </article>

            <article className="card">
              <div className="eyebrow">Modelo</div><h2 className="section-title">Cómo se está calculando</h2>
              <div className="stack">
                <div className="row"><div><div className="row-title">Recurrencias detectadas</div><div className="row-meta">Se exigen al menos tres apariciones y una frecuencia mensual compatible.</div></div><strong>{patterns.length}</strong></div>
                <div className="row"><div><div className="row-title">Movimientos explícitos</div><div className="row-meta">Tienen prioridad sobre una recurrencia detectada equivalente para evitar doble conteo.</div></div><strong>{plannedCount}</strong></div>
                <div className="row"><div><div className="row-title">Traspasos y exclusiones</div><div className="row-meta">No se consideran ingreso ni gasto en la previsión.</div></div><span className="state state-ok">Excluidos</span></div>
                <div className="row"><div><div className="row-title">Horizonte principal</div><div className="row-meta">Proyección de doce meses desde el último dato real.</div></div><strong>365 días</strong></div>
              </div>
            </article>
          </section>

          <PlanningManager
            initialEvents={futureEvents.map(toFutureEventView)}
            initialScenarios={scenarios.map(toScenarioView)}
            categories={categories}
            accounts={accounts}
          />
        </>
      )}
    </main>
  );
}
