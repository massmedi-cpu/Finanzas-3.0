'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type ReviewSeverity = 'high' | 'medium' | 'low';
export type ReviewIssueType = 'duplicate' | 'review' | 'uncategorized' | 'unusual_amount';

export interface ReviewMovement {
  id: string;
  date: string;
  account: string;
  concept: string;
  amount: number | null;
  category: string;
  subcategory: string;
  merchant: string;
  notes: string;
  reconciled: boolean;
  excludedFromAnalytics: boolean;
  reviewStatus: 'pending' | 'reviewed' | 'ignored';
}

export interface ReviewIssueView {
  id: string;
  type: ReviewIssueType;
  severity: ReviewSeverity;
  title: string;
  detail: string;
  movements: ReviewMovement[];
}

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function typeLabel(type: ReviewIssueType): string {
  if (type === 'duplicate') return 'Duplicado probable';
  if (type === 'review') return 'Revisión';
  if (type === 'uncategorized') return 'Categoría';
  return 'Anomalía';
}

export default function ReviewCenter({ initialIssues }: { initialIssues: ReviewIssueView[] }) {
  const router = useRouter();
  const [issues, setIssues] = useState(initialIssues);
  const [filter, setFilter] = useState<'all' | ReviewIssueType>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const visible = useMemo(() => filter === 'all' ? issues : issues.filter((issue) => issue.type === filter), [filter, issues]);
  const summary = useMemo(() => ({
    total: issues.length,
    high: issues.filter((issue) => issue.severity === 'high').length,
    duplicates: issues.filter((issue) => issue.type === 'duplicate').length,
    uncategorized: issues.filter((issue) => issue.type === 'uncategorized').length,
  }), [issues]);

  async function persist(movement: ReviewMovement, changes: Partial<Pick<ReviewMovement, 'reviewStatus' | 'excludedFromAnalytics'>>) {
    const next = { ...movement, ...changes };
    const response = await fetch('/api/private/movement', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceId: movement.id,
        category: movement.category,
        subcategory: movement.subcategory,
        merchant: movement.merchant,
        notes: movement.notes,
        reviewStatus: next.reviewStatus,
        reconciled: movement.reconciled,
        excludedFromAnalytics: next.excludedFromAnalytics,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error('save-failed');
  }

  async function resolveIssue(issue: ReviewIssueView) {
    setBusy(issue.id);
    setError('');
    try {
      await Promise.all(issue.movements.map((movement) => persist(movement, { reviewStatus: 'reviewed' })));
      setIssues((current) => current.filter((item) => item.id !== issue.id));
      router.refresh();
    } catch {
      setError('No se ha podido guardar la revisión. No se ha modificado la fuente bancaria.');
    } finally {
      setBusy(null);
    }
  }

  async function excludeDuplicateCopies(issue: ReviewIssueView) {
    if (issue.type !== 'duplicate' || issue.movements.length < 2) return;
    if (!window.confirm('Se conservará el primer movimiento y se excluirán del análisis las copias restantes. Es reversible desde Movimientos.')) return;
    setBusy(issue.id);
    setError('');
    try {
      const [first, ...copies] = issue.movements;
      await persist(first, { reviewStatus: 'reviewed', excludedFromAnalytics: false });
      await Promise.all(copies.map((movement) => persist(movement, { reviewStatus: 'reviewed', excludedFromAnalytics: true })));
      setIssues((current) => current.filter((item) => item.id !== issue.id));
      router.refresh();
    } catch {
      setError('No se ha podido completar la exclusión. La operación es segura y la fuente original sigue intacta.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="grid grid-4">
        <article className="card"><div className="metric-label">Incidencias abiertas</div><div className="metric-value">{summary.total}</div><p className="metric-note">Pendientes de comprobar</p></article>
        <article className="card"><div className="metric-label">Prioridad alta</div><div className="metric-value">{summary.high}</div><p className="metric-note">Duplicados o importes muy atípicos</p></article>
        <article className="card"><div className="metric-label">Duplicados probables</div><div className="metric-value">{summary.duplicates}</div><p className="metric-note">Grupos detectados automáticamente</p></article>
        <article className="card"><div className="metric-label">Sin categoría</div><div className="metric-value">{summary.uncategorized}</div><p className="metric-note">Afectan a presupuesto e informes</p></article>
      </section>

      <div className="toolbar section-gap">
        <select className="control" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filtrar incidencias">
          <option value="all">Todas las incidencias</option>
          <option value="duplicate">Duplicados probables</option>
          <option value="review">Pendientes de revisión</option>
          <option value="uncategorized">Sin categoría</option>
          <option value="unusual_amount">Importes atípicos</option>
        </select>
        <span className="badge">{visible.length} visibles</span>
      </div>

      {error && <div className="status-panel status-danger"><div><div className="status-title">No se ha completado la acción</div><div className="status-copy">{error}</div></div></div>}

      <section className="review-list">
        {visible.length === 0 ? (
          <div className="card"><div className="empty">No hay incidencias pendientes con este filtro.</div></div>
        ) : visible.map((issue) => (
          <article className={`card review-issue review-${issue.severity}`} key={issue.id}>
            <div className="review-head">
              <div>
                <div className="review-label-row"><span className={`state review-state-${issue.severity}`}>{typeLabel(issue.type)}</span><span className="row-meta">{issue.movements.length} movimiento{issue.movements.length === 1 ? '' : 's'}</span></div>
                <h2 className="review-title">{issue.title}</h2>
                <p className="metric-note">{issue.detail}</p>
              </div>
              <div className="review-actions">
                {issue.type === 'duplicate' && <button type="button" className="danger-ghost-button" onClick={() => excludeDuplicateCopies(issue)} disabled={busy === issue.id}>Excluir copias</button>}
                <button type="button" className="primary-inline-button" onClick={() => resolveIssue(issue)} disabled={busy === issue.id}>{busy === issue.id ? 'Guardando…' : 'Marcar comprobado'}</button>
              </div>
            </div>
            <div className="review-movements">
              {issue.movements.map((movement) => (
                <div className="review-movement" key={movement.id}>
                  <div>
                    <div className="row-title">{movement.merchant || movement.concept || 'Sin concepto'}</div>
                    <div className="row-meta">{movement.date} · {movement.account} · {movement.category || 'Sin categoría'}</div>
                  </div>
                  <div className={`amount ${movement.amount !== null && movement.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>{movement.amount === null ? '—' : euro.format(movement.amount)}</div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
