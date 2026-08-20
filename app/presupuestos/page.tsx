import { buildBudgetEnvelopes, previousMonth } from '../../src/domain/budget-engine';
import { getMonthlySummary } from '../../src/domain/finance-engine';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';
import { getPrivateState } from '../../src/private-data/client';
import { rowsForAnalytics } from '../../src/private-data/merge';
import BudgetEditor, { type BudgetCategoryView } from './BudgetEditor';

export const dynamic = 'force-dynamic';

export default async function PresupuestosPage() {
  let rows: BudgetCategoryView[] = [];
  let latestMonth: string | null = null;
  let monthlyIncome = 0;
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
        const analyticsRows = rowsForAnalytics(source.rows, privateState.overrides);
        monthlyIncome = getMonthlySummary(analyticsRows, latestMonth).income;
        const previous = previousMonth(latestMonth);
        const currentBudgets = privateState.budgets.filter((budget) => budget.year_month === latestMonth);
        const previousBudgets = privateState.budgets.filter((budget) => budget.year_month === previous);
        rows = buildBudgetEnvelopes(analyticsRows, latestMonth, currentBudgets, previousBudgets).map((envelope) => ({
          category: envelope.category,
          spent: envelope.spent,
          transactions: envelope.transactions,
          assigned: envelope.assigned,
          carryIn: envelope.carryIn,
          rollover: envelope.rollover,
        }));
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
          <h1>Da un trabajo a cada euro</h1>
          <p className="subtitle">Asigna tus ingresos del mes por categoría, arrastra remanentes cuando tenga sentido y controla el dinero libre antes de gastarlo.</p>
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
          {rows.length > 0 ? (
            <BudgetEditor yearMonth={latestMonth} rows={rows} monthlyIncome={monthlyIncome} />
          ) : (
            <section className="card"><div className="empty">No hay gastos ni presupuestos en este periodo.</div></section>
          )}
        </>
      )}
    </main>
  );
}
