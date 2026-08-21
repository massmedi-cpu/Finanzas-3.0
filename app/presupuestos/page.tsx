import Link from 'next/link';
import { getNormalizedBudget } from '../../src/normalized/analytics-client';
import BudgetEditor, { type BudgetCategoryView } from './BudgetEditor';

export const dynamic = 'force-dynamic';

function money(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function PresupuestosPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  let rows: BudgetCategoryView[] = [];
  let selectedMonth: string | null = null;
  let availableMonths: string[] = [];
  let monthlyIncome = 0;
  let dataError = false;

  try {
    const budget = await getNormalizedBudget(params.month);
    availableMonths = budget.availableMonths;
    selectedMonth = budget.selectedMonth;
    monthlyIncome = money(budget.monthlyIncome);
    rows = budget.rows.map((row) => ({
      category: row.category,
      spent: money(row.spent),
      transactions: row.transactions,
      assigned: money(row.assigned),
      carryIn: money(row.carryIn),
      rollover: row.rollover,
    }));
  } catch {
    dataError = true;
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Presupuestos</div>
          <h1>Da un trabajo a cada euro</h1>
          <p className="subtitle">Asigna tus ingresos por categoría, revisa meses anteriores y controla remanentes y dinero libre. Los movimientos divididos se reparten entre sus categorías reales.</p>
        </div>
        {selectedMonth && <span className="badge">Periodo {selectedMonth}</span>}
      </section>

      {availableMonths.length > 0 && (
        <nav className="month-selector" aria-label="Seleccionar mes del presupuesto">
          {availableMonths.slice(0, 12).map((month) => <Link key={month} href={`/presupuestos?month=${month}`} prefetch={false} className={`month-chip${month === selectedMonth ? ' month-chip-active' : ''}`}>{month}</Link>)}
        </nav>
      )}

      {dataError ? (
        <div className="status-panel status-danger">
          <div>
            <div className="status-title">No se ha podido calcular el presupuesto con garantías</div>
            <div className="status-copy">Se detiene el cálculo si el snapshot y el motor analítico normalizado no coinciden.</div>
          </div>
        </div>
      ) : !selectedMonth ? (
        <section className="card"><div className="empty">Los presupuestos se activarán cuando exista histórico bancario sincronizado.</div></section>
      ) : rows.length > 0 ? (
        <BudgetEditor yearMonth={selectedMonth} rows={rows} monthlyIncome={monthlyIncome} />
      ) : (
        <section className="card"><div className="empty">No hay gastos ni presupuestos en este periodo.</div></section>
      )}
    </main>
  );
}
