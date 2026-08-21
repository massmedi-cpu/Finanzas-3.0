import { getNormalizedReview } from '../../src/normalized/analytics-client';
import { APP_VERSION_LABEL } from '../../src/version';
import ReviewCenter, { type ReviewIssueView } from './ReviewCenter';

export const dynamic = 'force-dynamic';

export default async function RevisionPage() {
  let issues: ReviewIssueView[] = [];
  let dataError = false;

  try {
    const review = await getNormalizedReview();
    issues = review.issues.map((issue) => ({
      id: issue.id,
      type: issue.type,
      severity: issue.severity,
      title: issue.title,
      detail: issue.detail,
      movements: issue.movements.map((movement) => ({
        ...movement,
        amount: movement.amount === null ? null : Number(movement.amount),
      })),
    }));
  } catch {
    dataError = true;
  }

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <div className="eyebrow">Calidad de datos</div>
          <h1>Centro de revisión</h1>
          <p className="subtitle">Comprueba duplicados, movimientos pendientes, categorías vacías e importes poco habituales. Todas las decisiones son reversibles y se guardan fuera de la fuente bancaria.</p>
        </div>
        <span className="badge">{APP_VERSION_LABEL}</span>
      </section>

      {dataError ? (
        <div className="status-panel status-danger"><div><div className="status-title">No se puede ejecutar la revisión</div><div className="status-copy">El análisis se detiene si el snapshot y el motor normalizado no coinciden.</div></div></div>
      ) : (
        <ReviewCenter initialIssues={issues} />
      )}
    </main>
  );
}
