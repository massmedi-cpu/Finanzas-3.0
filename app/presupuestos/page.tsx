import { getCategorySpending } from '../../src/domain/category-analysis';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';

export const dynamic = 'force-dynamic';

const euro = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

export default async function PresupuestosPage() {
  let categories: ReturnType<typeof getCategorySpending> = [];
  let latestMonth: string | null = null;
  let sourceError = false;

  if (isGoogleSheetsConfigured()) {
    try {
      const source = await loadValidatedSource();
      latestMonth = source.latestMonth;
      categories = latestMonth ? getCategorySpending(source.rows, latestMonth) : [];
    } catch {
      sourceError = true;
    }
  }

  const spent = categories.reduce((sum, category) => sum + category.amount, 0);
  const maxAmount = categories[0]?.amount ?? 0;

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Presupuestos</div>
          <h1>Decide qué puede hacer cada euro</h1>
          <p className="subtitle">Primero se mide el gasto real por categoría. La asignación de presupuesto se guardará en la capa interna, nunca en la hoja maestra.</p>
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
      ) : categories.length === 0 ? (
        <section className="card"><div className="empty">La estructura de presupuestos está lista y se completará al conectar los movimientos.</div></section>
      ) : (
        <>
          <section className="grid grid-3">
            <article className="card">
              <div className="metric-label">Gasto del periodo</div>
              <div className="metric-value">{euro.format(spent)}</div>
              <p className="metric-note">Traspasos excluidos del cálculo</p>
            </article>
            <article className="card">
              <div className="metric-label">Categorías con gasto</div>
              <div className="metric-value">{categories.length}</div>
              <p className="metric-note">Detectadas en los movimientos reales</p>
            </article>
            <article className="card">
              <div className="metric-label">Presupuesto asignado</div>
              <div className="metric-value">—</div>
              <p className="metric-note">Pendiente de activar la capa editable</p>
            </article>
          </section>

          <section className="card section-gap">
            <h2 className="section-title">Gasto por categoría</h2>
            <div className="stack">
              {categories.map((category) => {
                const width = maxAmount > 0 ? Math.max(3, (category.amount / maxAmount) * 100) : 0;
                return (
                  <div className="row" key={category.category}>
                    <div className="category-main">
                      <div className="row-title">{category.category}</div>
                      <div className="row-meta">{category.transactions} movimientos · sin presupuesto asignado</div>
                      <div className="progress category-progress"><span style={{ width: `${width}%` }} /></div>
                    </div>
                    <div className="amount">{euro.format(category.amount)}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
