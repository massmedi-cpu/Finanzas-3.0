import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';
import MovementsExplorer, { type MovementView } from './MovementsExplorer';

export const dynamic = 'force-dynamic';

function toView(row: Awaited<ReturnType<typeof loadValidatedSource>>['rows'][number]): MovementView {
  return {
    id: row.sourceId,
    date: row.date,
    account: row.productOrAccount,
    type: row.movementType,
    category: row.category,
    subcategory: row.subcategory,
    concept: row.normalizedConcept || row.originalConcept,
    merchant: row.merchantOrCounterparty,
    amount: row.amount,
    balance: row.balance,
    channel: row.channel,
    reconciled: row.reconciled,
    review: row.review,
  };
}

export default async function MovimientosPage() {
  let movements: MovementView[] = [];
  let sourceError = false;

  if (isGoogleSheetsConfigured()) {
    try {
      const source = await loadValidatedSource();
      movements = source.rows.map(toView).sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      sourceError = true;
    }
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Movimientos</div>
          <h1>Operaciones bancarias</h1>
          <p className="subtitle">Busca y revisa tus operaciones desde una copia de trabajo; la fuente original se mantiene siempre en solo lectura.</p>
        </div>
        {movements.length > 0 && <span className="badge">{movements.length.toLocaleString('es-ES')} movimientos</span>}
      </section>

      {sourceError ? (
        <div className="status-panel status-danger">
          <div>
            <div className="status-title">La fuente no ha superado la validación</div>
            <div className="status-copy">No se muestra información parcial para evitar resultados incoherentes.</div>
          </div>
        </div>
      ) : movements.length > 0 ? (
        <MovementsExplorer rows={movements} />
      ) : (
        <section className="card">
          <div className="empty">La pantalla está lista. Los movimientos aparecerán al conectar de forma segura la hoja maestra.</div>
        </section>
      )}
    </main>
  );
}
