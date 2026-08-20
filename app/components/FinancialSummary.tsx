export default function FinancialSummary() {
  const items = [
    ['Dinero disponible', '0,00 €'],
    ['Ahorro mensual', '0,00 €'],
    ['Previsión 30 días', '0,00 €'],
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map(([title, value]) => (
        <article key={title} className="rounded-xl bg-white p-5 shadow">
          <h3 className="text-sm text-slate-500">{title}</h3>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </article>
      ))}
    </div>
  );
}
