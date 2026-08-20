import { getCategorySpending } from '../../src/domain/category-analysis';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';
import { getPrivateState, type BudgetRecord } from '../../src/private-data/client';
import { rowsForAnalytics } from '../../src/private-data/merge';
import BudgetEditor, { type BudgetCategoryView } from './BudgetEditor';

export const dynamic = 'force-dynamic';

function buildBudgetRows(
  spending: ReturnType<typeof getCategorySpending>,
  budgets: BudgetRecord[],
): BudgetCategoryView[] {
  const map = new Map<string, BudgetCategoryView>();
  for (const item of spending) {
    map.set(item.category, { category: item.category, spent: item.amount, transactions: item.transactions, assigned: 0 });
  }
  for (const budget of budgets) {
    const current = map.get(budget.category) ?? { category: budget.category, spent: 0, transactions: 0, assigned: 0 };
    current.assigned = Number(budget.assigned) || 0;
    map.set(budget.category, current);
  }
  return [...map.values()].sort((a, b) => (b.assigned > 0 ? 1 : 0) - (a.assigned > 0 ? 1 : 0) || b.spent - a.spent || a.category.localeCompare(b.category, 'es'));
}

export default async function PresupuestosPage() {
  let rows: BudgetCategoryView[] = [];
  let latestMonth: string | null = null;
  let sourceError = false;
  let editLayerError = false;

  if (isGoogleSheetsConfigured()) {
    try {
      const source = await loadValidatedSource();
      latestMonth = source.latestMonth;
      let privateState: Awaited<ReturnType<typeof getPrivateState>> = { overrides: [], budgets: [], goals: [], futureEvents: [], scenarios: [] };
      try {
        privateState = await getPrivateState();
      } catch {
        editLayerError = true;
      }

      if (latestMonth) {
        const spending = getCategorySpending(rowsForAnalytics(source.rows, privateState.overrides), latestMonth);
        const monthBudgets = privateState.budgets.filter((budget) => budget.year_month === latestMonth);
        rows = buildBudgetRows(spending, monthBudgets);
      }
    } catch {
      sourceError = true;
    }
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Presupuestos</div>
          <h1>Decide qué puede hacer cada euro</h1>
          <p className="subtitle">Asigna dinero por categoría y compáralo con el gasto real. Los traspasos y movimientos excluidos no distorsionan el presupuesto.</p>
        </div>
        {latestMonth && <span className="badge">Periodo {latestMonth}</span>}
      </section>

      {sourceError ? (
        <div className="status-panel status-danger">
          <div>
            <div className="status-title">No se ha podido calcular el presupuesto</div>
            <div className="status-copy">El análisis se detiene antes de mostrar cifras incompletas.</div>
          </div>
        </div>
      ) : !latestMonth ? (
        <section className="card"><div className="empty">Los presupuestos se activarán cuando exista histórico bancario sincronizado.</div></section>
      ) : (
        <>
          {editLayerError && (
            <div className="status-panel status-warning">
              <div>
                <div className="status-title">No se han podido cargar las asignaciones guardadas</div>
                <div className="status-copy">El gasto real sigue visible, pero la edición queda temporalmente limitada.</div>
              </div>
            </div>
          )}
          {rows.length > 0 ? <BudgetEditor yearMonth={latestMonth} rows={rows} /> : <section className="card"><div className="empty">No hay gastos ni presupuestos en este periodo.</div></section>}
        </>
      )}
    </main>
  );
}
