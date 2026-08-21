import { getNormalizedBootstrap, type NormalizedMovement } from '../../src/normalized/client';
import MovementsExplorerV210, {
  type MovementAccountOption,
  type MovementSplitView,
  type MovementView,
} from './MovementsExplorerV210';

function numberOrNull(value: number | string | null): number | null {
  if (value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function movementView(row: NormalizedMovement): MovementView {
  return {
    id: row.id,
    date: row.date,
    account: row.account,
    accountKey: row.accountKey,
    type: row.type,
    sourceCategory: row.sourceCategory,
    category: row.category,
    sourceSubcategory: row.sourceSubcategory,
    subcategory: row.subcategory,
    concept: row.concept,
    sourceMerchant: row.sourceMerchant,
    merchant: row.merchant,
    amount: numberOrNull(row.amount),
    balance: numberOrNull(row.balance),
    channel: row.channel,
    reviewStatus: row.reviewStatus,
    sourceReviewStatus: row.sourceReviewStatus,
    reconciled: Boolean(row.reconciled),
    sourceReconciled: Boolean(row.sourceReconciled),
    excludedFromAnalytics: Boolean(row.excludedFromAnalytics),
    notes: row.notes,
    hasOverride: Boolean(row.hasOverride),
    appliedRuleId: row.appliedRuleId || null,
    appliedRuleName: row.appliedRuleName || null,
    ruleApplied: Boolean(row.ruleApplied),
  };
}

function splitView(row: NormalizedMovement): MovementSplitView[] {
  return (row.splits || []).map((split) => ({
    lineNo: Number(split.lineNo),
    amount: Number(split.amount),
    category: split.category,
    subcategory: split.subcategory || '',
    notes: split.notes || '',
  }));
}

export default async function MovimientosPage() {
  let dataError = false;
  let movements: MovementView[] = [];
  let initialSplits: Record<string, MovementSplitView[]> = {};
  let total = 0;
  let nextCursor = null;
  let hasMore = false;
  let accountOptions: MovementAccountOption[] = [];

  try {
    const bootstrap = await getNormalizedBootstrap(100);
    if (!bootstrap.state.inSync || bootstrap.state.currentRows !== bootstrap.state.normalizedRows) {
      throw new Error('normalized-source-not-ready');
    }
    movements = bootstrap.page.items.map(movementView);
    initialSplits = Object.fromEntries(bootstrap.page.items.map((row) => [row.id, splitView(row)]).filter(([, splits]) => splits.length > 0));
    total = Number(bootstrap.page.total ?? bootstrap.state.normalizedRows ?? movements.length);
    nextCursor = bootstrap.page.nextCursor;
    hasMore = Boolean(bootstrap.page.hasMore);
    accountOptions = (bootstrap.state.accounts || []).map((account) => ({ accountKey: account.accountKey, name: account.name }));
  } catch {
    dataError = true;
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Movimientos</div>
          <h1>Operaciones bancarias</h1>
          <p className="subtitle">Busca, categoriza, divide, anota y concilia en tu copia de trabajo. La fuente bancaria original permanece siempre intacta.</p>
        </div>
        {!dataError && total > 0 && <span className="badge">{total.toLocaleString('es-ES')} movimientos</span>}
      </section>

      {dataError ? (
        <div className="status-panel status-danger">
          <div>
            <div className="status-title">No se puede construir la vista normalizada de movimientos</div>
            <div className="status-copy">La pantalla se detiene antes de mostrar datos parciales. La versión estable y la fuente bancaria original no se modifican.</div>
          </div>
        </div>
      ) : movements.length > 0 ? (
        <MovementsExplorerV210
          initialRows={movements}
          initialSplits={initialSplits}
          initialTotal={total}
          initialCursor={nextCursor}
          initialHasMore={hasMore}
          accountOptions={accountOptions}
        />
      ) : (
        <section className="card"><div className="empty">Los movimientos aparecerán cuando exista una fuente bancaria válida.</div></section>
      )}
    </main>
  );
}
