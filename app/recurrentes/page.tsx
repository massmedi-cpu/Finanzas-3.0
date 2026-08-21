import { buildForecast, detectRecurringPatterns } from '../../src/domain/forecast-engine';
import { getPrivateState } from '../../src/private-data/client';
import { rowsForAnalytics } from '../../src/private-data/merge';
import { getRecurringPreferences } from '../../src/private-data/recurring';
import { loadValidatedSource } from '../../src/sync/import-source';
import RecurringManager, { type RecurringView } from './RecurringManager';

export const dynamic = 'force-dynamic';

export default async function RecurrentesPage() {
  let dataError = false;
  let rows: RecurringView[] = [];
  let categories: string[] = [];

  try {
    const [source, privateState, preferences] = await Promise.all([loadValidatedSource(), getPrivateState(), getRecurringPreferences()]);
    const analyticsRows = rowsForAnalytics(source.rows, privateState.overrides);
    const patterns = detectRecurringPatterns(analyticsRows);
    const latestDate = source.rows.reduce<string>((latest, row) => row.date > latest ? row.date : latest, '');
    categories = [...new Set(analyticsRows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
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

  return <main className="page"><section className="page-header"><div><div className="eyebrow">Recurrentes</div><h1>Controla lo que se repite cada mes</h1><p className="subtitle">Confirma recibos, suscripciones e ingresos habituales, corrige importe o próxima fecha y decide qué patrones deben entrar en tus previsiones.</p></div>{rows.length > 0 && <span className="badge">{rows.length} patrones detectados</span>}</section>{dataError ? <div className="status-panel status-danger"><div><div className="status-title">No se han podido analizar los recurrentes con garantías</div><div className="status-copy">No se muestran patrones si falta la fuente, tus exclusiones privadas o las preferencias que ya has confirmado o ignorado.</div></div></div> : rows.length === 0 ? <section className="card"><div className="empty">Todavía no hay patrones mensuales con suficiente histórico para tratarlos como recurrentes.</div></section> : <RecurringManager initialRows={rows} categories={categories} />}</main>;
}
