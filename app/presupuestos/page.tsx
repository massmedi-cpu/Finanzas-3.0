import Link from 'next/link';
import { buildBudgetEnvelopes, previousMonth } from '../../src/domain/budget-engine';
import { getMonthlySummary } from '../../src/domain/finance-engine';
import { getAvailableMonths } from '../../src/domain/report-engine';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';
import { getPrivateState } from '../../src/private-data/client';
import { rowsForBudgetAndReports } from '../../src/private-data/merge';
import { getMovementSplits } from '../../src/private-data/splits';
import BudgetEditor, { type BudgetCategoryView } from './BudgetEditor';

export const dynamic = 'force-dynamic';

export default async function PresupuestosPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  let rows: BudgetCategoryView[] = [];
  let selectedMonth: string | null = null;
  let availableMonths: string[] = [];
  let monthlyIncome = 0;
  let dataError = false;

  if (isGoogleSheetsConfigured()) {
    try {
      const [source, privateState, splits] = await Promise.all([
        loadValidatedSource(),
        getPrivateState(),
        getMovementSplits(),
      ]);

      const budgetRows = rowsForBudgetAndReports(source.rows, privateState.overrides, splits);
      availableMonths = getAvailableMonths(budgetRows);
      selectedMonth = params.month && availableMonths.includes(params.month) ? params.month : (availableMonths[0] || source.latestMonth);

      if (selectedMonth) {
        monthlyIncome = getMonthlySummary(budgetRows, selectedMonth).income;
        const previous = previousMonth(selectedMonth);
        const currentBudgets = privateState.budgets.filter((budget) => budget.year_month === selectedMonth);
        const previousBudgets = privateState.budgets.filter((budget) => budget.year_month === previous);
        rows = buildBudgetEnvelopes(budgetRows, selectedMonth, currentBudgets, previousBudgets).map((envelope) => ({
          category: envelope.category,
          spent: envelope.spent,
          transactions: envelope.transactions,
          assigned: envelope.assigned,
          carryIn: envelope.carryIn,
          rollover: envelope.rollover,
        }));
      }
    } catch {
      dataError = true;
    }
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
            <div className="status-copy">Se detiene el cálculo si falta la fuente, tus ajustes privados o las divisiones de movimientos.</div>
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
