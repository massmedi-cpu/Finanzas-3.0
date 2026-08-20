import { getMonthlySummary, getNetWorthFromKnownBalances } from '../../src/domain/finance-engine';
import { getPrivateState } from '../../src/private-data/client';
import { indexOverrides, rowsForAnalytics, sourceReviewStatus } from '../../src/private-data/merge';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';

type SummaryItem = {
  label: string;
  value: string;
  note: string;
};

const euro = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

const emptyItems: SummaryItem[] = [
  { label: 'Patrimonio conocido', value: '—', note: 'Fuente pendiente de conectar' },
  { label: 'Ingresos del mes', value: '—', note: 'Sin datos sincronizados' },
  { label: 'Gastos del mes', value: '—', note: 'Sin datos sincronizados' },
  { label: 'Flujo neto del mes', value: '—', note: 'Sin datos sincronizados' },
];

export default async function FinancialSummary() {
  let items = emptyItems;

  if (isGoogleSheetsConfigured()) {
    try {
      const source = await loadValidatedSource();
      let overrides: Awaited<ReturnType<typeof getPrivateState>>['overrides'] = [];
      try {
        overrides = (await getPrivateState()).overrides;
      } catch {
        overrides = [];
      }

      const analyticsRows = rowsForAnalytics(source.rows, overrides);
      const summary = source.latestMonth ? getMonthlySummary(analyticsRows, source.latestMonth) : null;
      const overrideMap = indexOverrides(overrides);
      const pendingReview = source.latestMonth
        ? source.rows.filter((row) => row.date.startsWith(source.latestMonth) && !overrideMap.get(row.sourceId)?.excluded_from_analytics && (overrideMap.get(row.sourceId)?.review_status || sourceReviewStatus(row.review)) === 'pending').length
        : 0;

      items = [
        {
          label: 'Patrimonio conocido',
          value: euro.format(getNetWorthFromKnownBalances(source.rows)),
          note: `${source.accounts} cuentas con saldo conocido`,
        },
        {
          label: 'Ingresos del mes',
          value: summary ? euro.format(summary.income) : '—',
          note: source.latestMonth ? `Periodo ${source.latestMonth}` : 'Sin periodo disponible',
        },
        {
          label: 'Gastos del mes',
          value: summary ? euro.format(summary.expenses) : '—',
          note: summary ? `${summary.transactionCount} movimientos incluidos` : 'Sin movimientos',
        },
        {
          label: 'Flujo neto del mes',
          value: summary ? euro.format(summary.netCashFlow) : '—',
          note: `${pendingReview} movimientos pendientes de revisar`,
        },
      ];
    } catch {
      items = emptyItems.map((item) => ({ ...item, note: 'La fuente está configurada pero no se pudo validar' }));
    }
  }

  return (
    <section className="grid grid-4" aria-label="Resumen financiero">
      {items.map((item) => (
        <article key={item.label} className="card">
          <div className="metric-label">{item.label}</div>
          <div className="metric-value">{item.value}</div>
          <p className="metric-note">{item.note}</p>
        </article>
      ))}
    </section>
  );
}
