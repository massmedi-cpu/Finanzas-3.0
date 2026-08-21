import Link from 'next/link';
import { buildFinancialAlerts } from '../../src/domain/financial-alert-engine';
import { applyRecurringPreferences, buildForecast, combineForecasts, expandPlannedEvents, getLiquidityRisk } from '../../src/domain/forecast-engine';
import { projectGoal } from '../../src/domain/goal-engine';
import { getPrivateState } from '../../src/private-data/client';
import { getRecurringPreferences } from '../../src/private-data/recurring';
import { getNormalizedDashboardInputs } from '../../src/normalized/analytics-client';

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function alertClass(severity: 'critical' | 'warning' | 'info'): string {
  if (severity === 'critical') return 'intelligence-alert intelligence-alert-critical';
  if (severity === 'warning') return 'intelligence-alert intelligence-alert-warning';
  return 'intelligence-alert';
}

export default async function DashboardInsights() {
  try {
    const [dashboard, privateState, preferences] = await Promise.all([
      getNormalizedDashboardInputs(),
      getPrivateState(),
      getRecurringPreferences(),
    ]);

    const goals = privateState.goals;
    const futureEvents = privateState.futureEvents;
    const patterns = applyRecurringPreferences(dashboard.forecastInputs.patterns, preferences);
    const recurringConfirmed = preferences.filter((preference) => preference.status === 'confirmed').length;
    const recurringIgnored = preferences.filter((preference) => preference.status === 'ignored').length;

    const latestDate = dashboard.forecastInputs.baseDate || dashboard.state.maxDate || '';
    const forecast = latestDate
      ? combineForecasts(buildForecast(patterns, latestDate, 120), expandPlannedEvents(futureEvents, latestDate, 120))
      : [];
    const upcoming = forecast.slice(0, 4);
    const knownBalance = dashboard.state.accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
    const liquidity = getLiquidityRisk(forecast, knownBalance);
    const pending = dashboard.quality.pending;
    const duplicates = dashboard.quality.duplicates;
    const uncategorized = dashboard.quality.uncategorized;

    const activeGoals = goals.filter((goal) => goal.active).slice(0, 3).map((goal) => {
      const target = Number(goal.target_amount) || 0;
      const current = Number(goal.current_amount) || 0;
      const projection = latestDate ? projectGoal({
        targetAmount: target,
        currentAmount: current,
        targetDate: goal.target_date || null,
        monthlyContribution: goal.monthly_contribution == null ? null : Number(goal.monthly_contribution),
        asOfDate: latestDate,
      }) : null;
      return { goal, target, current, projection };
    });

    const goalRisks = activeGoals
      .filter((item) => item.projection?.status === 'at_risk' && (item.projection.monthlyGap ?? 0) > 0)
      .map((item) => ({
        id: item.goal.id,
        name: item.goal.name,
        monthlyGap: item.projection?.monthlyGap ?? 0,
        targetDate: item.goal.target_date || null,
        projectedCompletionDate: item.projection?.projectedCompletionDate ?? null,
      }));

    const alerts = latestDate ? buildFinancialAlerts({
      asOfDate: latestDate,
      knownBalance,
      liquidity,
      upcoming: forecast,
      pendingReview: pending,
      duplicateGroups: duplicates,
      uncategorized,
      goalRisks,
    }) : [];

    return (
      <>
        <section className="grid grid-2 section-gap">
          <article className="card">
            <div className="card-heading-row">
              <div>
                <div className="eyebrow">Previsión</div>
                <h2 className="section-title">Próximos movimientos</h2>
              </div>
              <Link href="/prevision" prefetch={false} className="text-link">Ver previsión</Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="empty compact-empty">Aún no hay movimientos futuros suficientemente fiables.</div>
            ) : (
              <div className="stack dashboard-list">
                {upcoming.map((movement) => (
                  <div className="row" key={movement.id}>
                    <div>
                      <div className="row-title">{movement.description}</div>
                      <div className="row-meta">{movement.expectedDate} · {movement.source === 'planned' ? 'planificado' : `confianza ${Math.round(movement.confidence * 100)}%`}</div>
                    </div>
                    <div className={`amount ${movement.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(movement.amount)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="dashboard-recurring-footer">
              <Link href="/recurrentes" prefetch={false} className="text-link">Gestionar recurrentes</Link>
              <span className="row-meta">{recurringConfirmed} confirmados · {recurringIgnored} ignorados</span>
            </div>
          </article>

          <article className="card">
            <div className="card-heading-row">
              <div>
                <div className="eyebrow">Inteligencia financiera</div>
                <h2 className="section-title">Prioridades ahora</h2>
              </div>
              <span className="badge">{alerts.length} alertas</span>
            </div>
            {alerts.length === 0 ? (
              <div className="empty compact-empty">No hay alertas financieras relevantes con los datos actuales.</div>
            ) : (
              <div className="intelligence-alert-list">
                {alerts.map((alert) => (
                  <Link href={alert.href} prefetch={false} className={alertClass(alert.severity)} key={alert.id}>
                    <div className="intelligence-alert-head"><strong>{alert.title}</strong><span>{alert.severity === 'critical' ? 'Prioridad' : alert.severity === 'warning' ? 'Atención' : 'Dato'}</span></div>
                    <p>{alert.message}</p>
                    <small>{alert.evidence}</small>
                  </Link>
                ))}
              </div>
            )}
            <div className="alert-summary alert-summary-3 intelligence-quality-summary">
              <div className="alert-stat"><strong>{pending}</strong><span>pendientes</span></div>
              <div className="alert-stat"><strong>{duplicates}</strong><span>duplicados</span></div>
              <div className="alert-stat"><strong>{uncategorized}</strong><span>sin categoría</span></div>
            </div>
          </article>
        </section>

        <section className="card section-gap">
          <div className="card-heading-row">
            <div>
              <div className="eyebrow">Objetivos</div>
              <h2 className="section-title">Metas financieras</h2>
            </div>
            <Link href="/objetivos" prefetch={false} className="text-link">Gestionar objetivos</Link>
          </div>
          {activeGoals.length === 0 ? (
            <div className="empty compact-empty">Crea tu primer objetivo para seguir su progreso desde el panel.</div>
          ) : (
            <div className="grid grid-3">
              {activeGoals.map(({ goal, target, current, projection }) => {
                const progress = projection?.progressPct ?? (target > 0 ? Math.min(100, (current / target) * 100) : 0);
                const risk = projection?.status === 'at_risk';
                return (
                  <div className={`dashboard-goal${risk ? ' dashboard-goal-risk' : ''}`} key={goal.id}>
                    <div className="goal-item-head">
                      <div className="row-title">{goal.name}</div>
                      {projection && <span className={`state ${risk ? 'state-warning' : projection.status === 'completed' || projection.status === 'on_track' ? 'state-ok' : 'state-muted'}`}>{projection.status === 'completed' ? 'Completado' : projection.status === 'on_track' ? 'En plazo' : projection.status === 'at_risk' ? 'En riesgo' : 'Sin plan'}</span>}
                    </div>
                    <div className="metric-note">{euro.format(current)} de {euro.format(target)}</div>
                    <div className="progress goal-progress"><span style={{ width: `${progress}%` }} /></div>
                    <div className="row-meta">{Math.round(progress)}% completado{projection?.requiredMonthlyContribution != null && projection.status !== 'completed' ? ` · necesita ${euro.format(projection.requiredMonthlyContribution)}/mes` : goal.target_date ? ` · ${goal.target_date}` : ''}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </>
    );
  } catch {
    return (
      <section className="card section-gap">
        <div className="empty compact-empty">Los análisis avanzados quedan ocultos hasta recuperar todas las capas de datos necesarias.</div>
      </section>
    );
  }
}
