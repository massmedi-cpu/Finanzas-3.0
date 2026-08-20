type SummaryItem = {
  label: string;
  value: string;
  note: string;
};

const items: SummaryItem[] = [
  { label: 'Dinero disponible', value: '—', note: 'Pendiente de sincronizar datos' },
  { label: 'Ingresos del mes', value: '—', note: 'Sin datos importados todavía' },
  { label: 'Gastos del mes', value: '—', note: 'Sin datos importados todavía' },
  { label: 'Ahorro del mes', value: '—', note: 'Se calculará automáticamente' },
];

export default function FinancialSummary() {
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
