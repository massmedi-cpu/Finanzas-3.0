import { getNormalizedSummary } from '../../src/normalized/client';

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
  { label: 'Patrimonio conocido', value: '—', note: 'Fuente pendiente de validar' },
  { label: 'Ingresos del mes', value: '—', note: 'Sin datos sincronizados' },
  { label: 'Gastos del mes', value: '—', note: 'Sin datos sincronizados' },
  { label: 'Flujo neto del mes', value: '—', note: 'Sin datos sincronizados' },
];

function amount(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function FinancialSummary() {
  let items = emptyItems;

  try {
    const summary = await getNormalizedSummary();
    const period = summary.yearMonth;
    items = [
      {
        label: 'Patrimonio conocido',
        value: euro.format(amount(summary.netWorth)),
        note: `${summary.accounts.length} cuentas con saldo conocido`,
      },
      {
        label: 'Ingresos del mes',
        value: euro.format(amount(summary.income)),
        note: period ? `Periodo ${period}` : 'Sin periodo disponible',
      },
      {
        label: 'Gastos del mes',
        value: euro.format(amount(summary.expenses)),
        note: `${summary.transactionCount} movimientos del periodo`,
      },
      {
        label: 'Flujo neto del mes',
        value: euro.format(amount(summary.netCashFlow)),
        note: `${summary.needsReview} movimientos pendientes de revisar`,
      },
    ];
  } catch {
    items = emptyItems.map((item) => ({ ...item, note: 'No se pudo validar el snapshot y el modelo normalizado completo' }));
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
