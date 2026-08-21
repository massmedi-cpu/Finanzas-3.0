import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';
import { getPrivateState, type MovementOverride } from '../../src/private-data/client';
import { indexOverrides, sourceBoolean, sourceReviewStatus } from '../../src/private-data/merge';
import { getMovementSplits, indexMovementSplits, type MovementSplitRecord } from '../../src/private-data/splits';
import MovementsExplorer, { type MovementView, type MovementSplitView } from './MovementsExplorer';

export const dynamic = 'force-dynamic';

function toView(row: Awaited<ReturnType<typeof loadValidatedSource>>['rows'][number], override?: MovementOverride): MovementView {
  const sourceReview = sourceReviewStatus(row.review);
  const sourceReconciled = sourceBoolean(row.reconciled);
  return { id: row.sourceId, date: row.date, account: row.productOrAccount, type: row.movementType, sourceCategory: row.category, category: override?.category || row.category, sourceSubcategory: row.subcategory, subcategory: override?.subcategory || row.subcategory, concept: row.normalizedConcept || row.originalConcept, sourceMerchant: row.merchantOrCounterparty, merchant: override?.merchant || row.merchantOrCounterparty, amount: row.amount, balance: row.balance, channel: row.channel, reviewStatus: override?.review_status || sourceReview, sourceReviewStatus: sourceReview, reconciled: override?.reconciled ?? sourceReconciled, sourceReconciled, excludedFromAnalytics: override?.excluded_from_analytics ?? false, notes: override?.notes || row.notes, hasOverride: Boolean(override) };
}
function splitView(record: MovementSplitRecord): MovementSplitView { return { lineNo: Number(record.line_no), amount: Number(record.amount), category: record.category, subcategory: record.subcategory || '', notes: record.notes || '' }; }

export default async function MovimientosPage() {
  let movements: MovementView[] = [];
  let initialSplits: Record<string, MovementSplitView[]> = {};
  let dataError = false;

  if (isGoogleSheetsConfigured()) {
    try {
      const [source, privateState, splitRecords] = await Promise.all([loadValidatedSource(), getPrivateState(), getMovementSplits()]);
      const overrides = indexOverrides(privateState.overrides);
      const splits = indexMovementSplits(splitRecords);
      initialSplits = Object.fromEntries([...splits.entries()].map(([sourceId, lines]) => [sourceId, lines.map(splitView)]));
      movements = source.rows.map((row) => toView(row, overrides.get(row.sourceId))).sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      dataError = true;
    }
  }

  return <main className="page"><section className="page-header"><div><div className="eyebrow">Movimientos</div><h1>Operaciones bancarias</h1><p className="subtitle">Busca, categoriza, divide, anota y concilia en tu copia de trabajo. La hoja bancaria original permanece siempre intacta.</p></div>{movements.length > 0 && <span className="badge">{movements.length.toLocaleString('es-ES')} movimientos</span>}</section>{dataError ? <div className="status-panel status-danger"><div><div className="status-title">No se puede construir la vista completa de movimientos</div><div className="status-copy">Se detiene la pantalla si falta la fuente, tus ajustes privados o las divisiones para no mostrar ni editar una copia incompleta.</div></div></div> : movements.length > 0 ? <MovementsExplorer rows={movements} initialSplits={initialSplits} /> : <section className="card"><div className="empty">Los movimientos aparecerán cuando exista una fuente bancaria válida.</div></section>}</main>;
}
