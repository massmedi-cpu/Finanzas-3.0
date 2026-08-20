import { detectQualityIssues } from '../../src/domain/quality-engine';
import { getPrivateState, type MovementOverride } from '../../src/private-data/client';
import { applyOverride, indexOverrides, sourceBoolean, sourceReviewStatus } from '../../src/private-data/merge';
import { isGoogleSheetsConfigured } from '../../src/sync/google-sheets';
import { loadValidatedSource } from '../../src/sync/import-source';
import ReviewCenter, { type ReviewIssueView, type ReviewMovement } from './ReviewCenter';

export const dynamic = 'force-dynamic';

function movementView(
  row: Awaited<ReturnType<typeof loadValidatedSource>>['rows'][number],
  override?: MovementOverride,
): ReviewMovement {
  const merged = applyOverride(row, override);
  return {
    id: row.sourceId,
    date: row.date,
    account: row.productOrAccount,
    concept: row.normalizedConcept || row.originalConcept,
    amount: row.amount,
    category: merged.category,
    subcategory: merged.subcategory,
    merchant: merged.merchantOrCounterparty,
    notes: merged.notes,
    reconciled: override?.reconciled ?? sourceBoolean(row.reconciled),
    excludedFromAnalytics: override?.excluded_from_analytics ?? false,
    reviewStatus: override?.review_status ?? sourceReviewStatus(row.review),
  };
}

export default async function RevisionPage() {
  let issues: ReviewIssueView[] = [];
  let sourceError = false;
  let privateLayerError = false;

  if (isGoogleSheetsConfigured()) {
    try {
      const source = await loadValidatedSource();
      let overrides = new Map<string, MovementOverride>();
      try {
        const state = await getPrivateState();
        overrides = indexOverrides(state.overrides);
      } catch {
        privateLayerError = true;
      }

      const rowsById = new Map(source.rows.map((row) => [row.sourceId, row]));
      issues = detectQualityIssues(source.rows).flatMap((issue) => {
        const movements = issue.sourceIds
          .map((sourceId) => rowsById.get(sourceId))
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .map((row) => movementView(row, overrides.get(row.sourceId)));

        if (!movements.length) return [];

        if (issue.type === 'review') {
          if (movements.every((movement) => movement.reviewStatus !== 'pending')) return [];
        } else {
          const explicitlyResolved = movements.every((movement) => {
            const override = overrides.get(movement.id);
            return Boolean(override && override.review_status !== 'pending');
          });
          if (explicitlyResolved) return [];
        }

        return [{ ...issue, movements }];
      });
    } catch {
      sourceError = true;
    }
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Calidad de datos</div>
          <h1>Centro de revisión</h1>
          <p className="subtitle">Comprueba duplicados, movimientos pendientes, categorías vacías e importes poco habituales. Todas las decisiones son reversibles y se guardan fuera de la fuente bancaria.</p>
        </div>
        <span className="badge">V1.7.0</span>
      </section>

      {sourceError ? (
        <div className="status-panel status-danger"><div><div className="status-title">No se puede ejecutar la revisión</div><div className="status-copy">La fuente debe validarse antes de analizar posibles incidencias.</div></div></div>
      ) : !isGoogleSheetsConfigured() ? (
        <section className="card"><div className="empty">El centro de revisión se activará al conectar la fuente bancaria.</div></section>
      ) : (
        <>
          {privateLayerError && <div className="status-panel status-warning"><div><div className="status-title">La capa privada no está disponible</div><div className="status-copy">Se muestran detecciones, pero no deben confirmarse hasta recuperar la conexión privada.</div></div></div>}
          <ReviewCenter initialIssues={issues} />
        </>
      )}
    </main>
  );
}
