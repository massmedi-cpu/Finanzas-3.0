import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';
import { getPrivateState, type MovementOverride } from '../../src/private-data/client';
import { indexOverrides, sourceBoolean, sourceReviewStatus } from '../../src/private-data/merge';
import MovementsExplorer, { type MovementView } from './MovementsExplorer';

export const dynamic = 'force-dynamic';

function toView(
  row: Awaited<ReturnType<typeof loadValidatedSource>>['rows'][number],
  override?: MovementOverride,
): MovementView {
  const sourceReview = sourceReviewStatus(row.review);
  const sourceReconciled = sourceBoolean(row.reconciled);

  return {
    id: row.sourceId,
    date: row.date,
    account: row.productOrAccount,
    type: row.movementType,
    sourceCategory: row.category,
    category: override?.category || row.category,
    sourceSubcategory: row.subcategory,
    subcategory: override?.subcategory || row.subcategory,
    concept: row.normalizedConcept || row.originalConcept,
    sourceMerchant: row.merchantOrCounterparty,
    merchant: override?.merchant || row.merchantOrCounterparty,
    amount: row.amount,
    balance: row.balance,
    channel: row.channel,
    reviewStatus: override?.review_status || sourceReview,
    sourceReviewStatus: sourceReview,
    reconciled: override?.reconciled ?? sourceReconciled,
    sourceReconciled,
    excludedFromAnalytics: override?.excluded_from_analytics ?? false,
    notes: override?.notes || row.notes,
    hasOverride: Boolean(override),
  };
}

export default async function MovimientosPage() {
  let movements: MovementView[] = [];
  let sourceError = false;
  let editLayerError = false;

  if (isGoogleSheetsConfigured()) {
    try {
      const source = await loadValidatedSource();
      let overrides = new Map<string, MovementOverride>();
      try {
        const privateState = await getPrivateState();
        overrides = indexOverrides(privateState.overrides);
      } catch {
        editLayerError = true;
      }
      movements = source.rows.map((row) => toView(row, overrides.get(row.sourceId))).sort((a, b) => b.date.localeCompare(a.date));
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
          <p className="subtitle">Busca, categoriza, anota y concilia en tu copia de trabajo. La hoja bancaria original permanece siempre intacta.</p>
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
      ) : (
        <>
          {editLayerError && (
            <div className="status-panel status-warning">
              <div>
                <div className="status-title">La capa editable no está disponible temporalmente</div>
                <div className="status-copy">Puedes consultar la fuente, pero los ajustes internos no se mostrarán hasta recuperar la conexión.</div>
              </div>
            </div>
          )}
          {movements.length > 0 ? (
            <MovementsExplorer rows={movements} />
          ) : (
            <section className="card">
              <div className="empty">Los movimientos aparecerán cuando exista una fuente bancaria válida.</div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
