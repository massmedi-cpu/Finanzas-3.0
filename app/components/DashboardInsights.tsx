import Link from 'next/link';
import { applyRecurringPreferences, buildForecast, combineForecasts, detectRecurringPatterns, expandPlannedEvents, getLiquidityRisk } from '../../src/domain/forecast-engine';
import { getNetWorthFromKnownBalances } from '../../src/domain/finance-engine';
import { detectQualityIssues } from '../../src/domain/quality-engine';
import { getPrivateState } from '../../src/private-data/client';
import { indexOverrides, rowsForAnalytics, sourceReviewStatus } from '../../src/private-data/merge';
import { getRecurringPreferences } from '../../src/private-data/recurring';
import { loadValidatedSource } from '../../src/sync/import-source';

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default async function DashboardInsights() {
  try {
    const [source, state, preferences] = await Promise.all([
      loadValidatedSource(),
      getPrivateState(),
      getRecurringPreferences(),
    ]);

    const overrides = state.overrides;
    const goals = state.goals;
    const futureEvents = state.futureEvents;
    const analyticsRows = rowsForAnalytics(source.rows, overrides);
    const detectedPatterns = detectRecurringPatterns(analyticsRows);
    const patterns = applyRecurringPreferences(detectedPatterns, preferences);
    const recurringConfirmed = preferences.filter((preference) => preference.status === 'confirmed').length;
    const recurringIgnored = preferences.filter((preference) => preference.status === 'ignored').length;

    const latestDate = source.rows.reduce<string>((latest, row) => row.date > latest ? row.date : latest, '');
    const forecast = latestDate
      ? combineForecasts(buildForecast(patterns, latestDate, 120), expandPlannedEvents(futureEvents, latestDate, 120))
      : [];
    const upcoming = forecast.slice(0, 4);
    const liquidity = getLiquidityRisk(forecast, getNetWorthFromKnownBalances(source.rows));
    const overrideMap = indexOverrides(overrides);
    const pending = source.rows.filter((row) => !overrideMap.get(row.sourceId)?.excluded_from_analytics && (overrideMap.get(row.sourceId)?.review_status || sourceReviewStatus(row.review)) === 'pending').length;
    const qualityIssues = detectQualityIssues(analyticsRows);
    const duplicates = qualityIssues.filter((issue) => issue.type === 'duplicate').length;
    const uncategorized = qualityIssues.filter((issue) => issue.type === 'uncategorized').length;
    const activeGoals = goals.filter((goal) => goal.active).slice(0, 3);

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
                <div className="eyebrow">Control</div>
                <h2 className="section-title">Calidad y alertas</h2>
              </div>
              <Link href="/revision" prefetch={false} className="text-link">Centro de revisión</Link>
            </div>
            <div className="alert-summary alert-summary-3">
              <div className="alert-stat"><strong>{pending}</strong><span>pendientes de revisar</span></div>
              <div className="alert-stat"><strong>{duplicates}</strong><span>grupos de posibles duplicados</span></div>
              <div className="alert-stat"><strong>{uncategorized}</strong><span>movimientos sin categoría</span></div>
            </div>
            {liquidity.firstNegativeDate && <div className="status-panel status-danger dashboard-risk"><div><div className="status-title">Riesgo de liquidez</div><div className="status-copy">Saldo negativo previsto desde {liquidity.firstNegativeDate}. Revisa la previsión.</div></div><Link href="/prevision" prefetch={false} className="text-link">Ver</Link></div>}
            <p className="metric-note">El centro de revisión permite confirmar o excluir incidencias sin borrar ni modificar movimientos de la fuente bancaria.</p>
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
              {activeGoals.map((goal) => {
                const target = Number(goal.target_amount) || 0;
                const current = Number(goal.current_amount) || 0;
                const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                return (
                  <div className="dashboard-goal" key={goal.id}>
                    <div className="row-title">{goal.name}</div>
                    <div className="metric-note">{euro.format(current)} de {euro.format(target)}</div>
                    <div className="progress goal-progress"><span style={{ width: `${progress}%` }} /></div>
                    <div className="row-meta">{Math.round(progress)}% completado{goal.target_date ? ` · ${goal.target_date}` : ''}</div>
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
