'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type ReviewStatus = 'pending' | 'reviewed' | 'ignored';

export interface MovementView {
  id: string;
  date: string;
  account: string;
  type: string;
  sourceCategory: string;
  category: string;
  sourceSubcategory: string;
  subcategory: string;
  concept: string;
  sourceMerchant: string;
  merchant: string;
  amount: number | null;
  balance: number | null;
  channel: string;
  reviewStatus: ReviewStatus;
  sourceReviewStatus: ReviewStatus;
  reconciled: boolean;
  sourceReconciled: boolean;
  excludedFromAnalytics: boolean;
  notes: string;
  hasOverride: boolean;
}

const euro = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

function normalize(value: string): string {
  return value.toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function MovementsExplorer({ rows }: { rows: MovementView[] }) {
  const router = useRouter();
  const [localRows, setLocalRows] = useState(rows);
  const [query, setQuery] = useState('');
  const [account, setAccount] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<MovementView | null>(null);
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [merchant, setMerchant] = useState('');
  const [notes, setNotes] = useState('');
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('pending');
  const [reconciled, setReconciled] = useState(false);
  const [excluded, setExcluded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const accounts = useMemo(
    () => [...new Set(localRows.map((row) => row.account).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [localRows],
  );

  const categories = useMemo(
    () => [...new Set(localRows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [localRows],
  );

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());

    return localRows.filter((row) => {
      if (account !== 'all' && row.account !== account) return false;
      if (status === 'review' && row.reviewStatus !== 'pending') return false;
      if (status === 'ok' && row.reviewStatus === 'pending') return false;

      if (!needle) return true;
      const haystack = normalize([
        row.date,
        row.account,
        row.type,
        row.category,
        row.subcategory,
        row.concept,
        row.merchant,
        row.channel,
        row.notes,
        row.amount === null ? '' : String(row.amount).replace('.', ','),
      ].join(' '));
      return haystack.includes(needle);
    });
  }, [account, localRows, query, status]);

  function openEditor(row: MovementView) {
    setSelected(row);
    setCategory(row.category);
    setSubcategory(row.subcategory);
    setMerchant(row.merchant);
    setNotes(row.notes);
    setReviewStatus(row.reviewStatus);
    setReconciled(row.reconciled);
    setExcluded(row.excludedFromAnalytics);
    setError('');
  }

  function closeEditor() {
    if (saving) return;
    setSelected(null);
    setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/private/movement', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId: selected.id,
          category,
          subcategory,
          merchant,
          notes,
          reviewStatus,
          reconciled,
          excludedFromAnalytics: excluded,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('save-failed');

      setLocalRows((current) => current.map((row) => row.id === selected.id ? {
        ...row,
        category: category.trim() || row.sourceCategory,
        subcategory: subcategory.trim() || row.sourceSubcategory,
        merchant: merchant.trim() || row.sourceMerchant,
        notes: notes.trim(),
        reviewStatus,
        reconciled,
        excludedFromAnalytics: excluded,
        hasOverride: true,
      } : row));
      setSelected(null);
      router.refresh();
    } catch {
      setError('No se ha podido guardar el cambio. La fuente original no se ha modificado.');
    } finally {
      setSaving(false);
    }
  }

  async function restoreSource() {
    if (!selected?.hasOverride || saving) return;
    if (!window.confirm('¿Restaurar los datos originales de este movimiento? Se eliminarán solo tus ajustes internos.')) return;
    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/private/movement?sourceId=${encodeURIComponent(selected.id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('restore-failed');

      setLocalRows((current) => current.map((row) => row.id === selected.id ? {
        ...row,
        category: row.sourceCategory,
        subcategory: row.sourceSubcategory,
        merchant: row.sourceMerchant,
        notes: '',
        reviewStatus: row.sourceReviewStatus,
        reconciled: row.sourceReconciled,
        excludedFromAnalytics: false,
        hasOverride: false,
      } : row));
      setSelected(null);
      router.refresh();
    } catch {
      setError('No se ha podido restaurar el movimiento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="control search"
          aria-label="Buscar movimientos"
          placeholder="Buscar concepto, comercio, importe o categoría"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="control" aria-label="Filtrar por cuenta" value={account} onChange={(event) => setAccount(event.target.value)}>
          <option value="all">Todas las cuentas</option>
          {accounts.map((name) => <option value={name} key={name}>{name}</option>)}
        </select>
        <select className="control" aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Todos los estados</option>
          <option value="review">Pendientes de revisar</option>
          <option value="ok">Sin revisión pendiente</option>
        </select>
      </div>

      <section className="card table-card">
        <div className="row table-summary-row">
          <div>
            <div className="row-title">Movimientos</div>
            <div className="row-meta">{filtered.length.toLocaleString('es-ES')} de {localRows.length.toLocaleString('es-ES')} operaciones</div>
          </div>
          <span className="badge">Edición interna · fuente protegida</span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty section-gap">No hay movimientos que coincidan con los filtros.</div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Categoría</th>
                  <th>Cuenta</th>
                  <th className="numeric">Importe</th>
                  <th className="numeric">Saldo</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id || `${row.date}-${row.account}-${row.concept}-${row.amount}`}>
                    <td className="date-cell">{row.date}</td>
                    <td>
                      <div className="table-primary">{row.merchant || row.concept || 'Sin concepto'} {row.hasOverride && <span className="edited-dot" title="Con ajustes internos">●</span>}</div>
                      <div className="table-secondary">{row.merchant && row.concept !== row.merchant ? row.concept : row.channel}</div>
                    </td>
                    <td>
                      <div className="table-primary">{row.category || 'Sin categoría'}</div>
                      <div className="table-secondary">{row.subcategory}</div>
                    </td>
                    <td>{row.account}</td>
                    <td className={`numeric amount ${row.amount !== null && row.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>
                      {row.amount === null ? '—' : euro.format(row.amount)}
                    </td>
                    <td className="numeric">{row.balance === null ? '—' : euro.format(row.balance)}</td>
                    <td>
                      {row.reviewStatus === 'pending'
                        ? <span className="state state-review">Revisar</span>
                        : <span className="state state-ok">{row.reviewStatus === 'ignored' ? 'Ignorado' : 'Revisado'}</span>}
                    </td>
                    <td className="numeric"><button type="button" className="small-button" onClick={() => openEditor(row)}>Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeEditor()}>
          <section className="editor-panel" role="dialog" aria-modal="true" aria-labelledby="movement-editor-title">
            <div className="editor-header">
              <div>
                <div className="eyebrow">Copia de trabajo</div>
                <h2 id="movement-editor-title" className="editor-title">Editar movimiento</h2>
                <div className="row-meta">{selected.date} · {selected.account} · {selected.amount === null ? '—' : euro.format(selected.amount)}</div>
              </div>
              <button type="button" className="icon-button" onClick={closeEditor} aria-label="Cerrar">×</button>
            </div>

            <div className="editor-source-note">El movimiento bancario original permanece intacto. Solo se guardan tus ajustes en la capa interna.</div>

            <form onSubmit={save} className="form-stack">
              <div className="form-grid">
                <label className="form-field">
                  <span>Categoría</span>
                  <input className="control" list="movement-categories" value={category} onChange={(event) => setCategory(event.target.value)} />
                  <datalist id="movement-categories">{categories.map((item) => <option value={item} key={item} />)}</datalist>
                </label>
                <label className="form-field">
                  <span>Subcategoría</span>
                  <input className="control" value={subcategory} onChange={(event) => setSubcategory(event.target.value)} />
                </label>
              </div>

              <label className="form-field">
                <span>Comercio o contraparte</span>
                <input className="control" value={merchant} onChange={(event) => setMerchant(event.target.value)} />
              </label>

              <label className="form-field">
                <span>Notas</span>
                <textarea className="control textarea" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>

              <label className="form-field">
                <span>Estado de revisión</span>
                <select className="control" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}>
                  <option value="pending">Pendiente de revisar</option>
                  <option value="reviewed">Revisado</option>
                  <option value="ignored">Ignorado</option>
                </select>
              </label>

              <div className="check-grid">
                <label className="check-row"><input type="checkbox" checked={reconciled} onChange={(event) => setReconciled(event.target.checked)} /><span>Conciliado</span></label>
                <label className="check-row"><input type="checkbox" checked={excluded} onChange={(event) => setExcluded(event.target.checked)} /><span>Excluir de análisis y presupuestos</span></label>
              </div>

              {error && <div className="form-error" role="alert">{error}</div>}

              <div className="editor-actions">
                {selected.hasOverride && <button type="button" className="danger-ghost-button" onClick={restoreSource} disabled={saving}>Restaurar original</button>}
                <div className="editor-actions-right">
                  <button type="button" className="secondary-button" onClick={closeEditor} disabled={saving}>Cancelar</button>
                  <button type="submit" className="primary-inline-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
