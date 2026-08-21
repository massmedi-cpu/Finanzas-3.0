import { buildForecast } from '../../src/domain/forecast-engine';
import { getRecurringPreferences } from '../../src/private-data/recurring';
import { getNormalizedForecastInputs } from '../../src/normalized/analytics-client';
import RecurringManager, { type RecurringView } from './RecurringManager';

export const dynamic = 'force-dynamic';

export default async function RecurrentesPage() {
  let dataError = false;
  let rows: RecurringView[] = [];
  let categories: string[] = [];

  try {
    const [forecastInputs, preferences] = await Promise.all([getNormalizedForecastInputs(), getRecurringPreferences()]);
    const patterns = forecastInputs.patterns;
    const latestDate = forecastInputs.baseDate || forecastInputs.state.maxDate || '';
    categories = forecastInputs.categories;
    const preferenceMap = new Map(preferences.map((preference) => [preference.pattern_key, preference]));
    rows = patterns.map((pattern) => {
      const preference = preferenceMap.get(pattern.key);
      const customAmount = preference?.expected_amount == null ? null : Number(preference.expected_amount);
      const automaticNext = latestDate ? buildForecast([pattern], latestDate, 400)[0]?.expectedDate || '' : '';
      return { key: pattern.key, description: pattern.description, category: preference?.category || pattern.category, averageAmount: pattern.averageAmount, expectedAmount: customAmount !== null && Number.isFinite(customAmount) ? customAmount : pattern.averageAmount, intervalDays: pattern.intervalDays, occurrences: pattern.occurrences, lastDate: pattern.lastDate, nextDate: preference?.next_expected_date || automaticNext, confidence: pattern.confidence, status: preference?.status || 'auto', displayName: preference?.display_name || pattern.description, notes: preference?.notes || '', customized: Boolean(preference) };
    });
  } catch {
    dataError = true;
  }

  return <main className="page"><section className="page-header"><div><div className="eyebrow">Recurrentes</div><h1>Controla lo que se repite cada mes</h1><p className="subtitle">Confirma recibos, suscripciones e ingresos habituales, corrige importe o próxima fecha y decide qué patrones deben entrar en tus previsiones.</p></div>{rows.length > 0 && <span className="badge">{rows.length} patrones detectados</span>}</section>{dataError ? <div className="status-panel status-danger"><div><div className="status-title">No se han podido analizar los recurrentes con garantías</div><div className="status-copy">No se muestran patrones si falta el modelo normalizado o las preferencias que ya has confirmado o ignorado.</div></div></div> : rows.length === 0 ? <section className="card"><div className="empty">Todavía no hay patrones mensuales con suficiente histórico para tratarlos como recurrentes.</div></section> : <RecurringManager initialRows={rows} categories={categories} />}</main>;
}
