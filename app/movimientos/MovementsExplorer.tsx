'use client';

import { FormEvent, useMemo, useState } from 'react';

export type ReviewStatus = 'pending' | 'reviewed' | 'ignored';

export interface MovementSplitView {
  lineNo: number;
  amount: number;
  category: string;
  subcategory: string;
  notes: string;
}

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

interface SplitDraft {
  amount: string;
  category: string;
  subcategory: string;
  notes: string;
}

const PAGE_SIZE = 100;
const euro = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

function normalize(value: string): string {
  return value.toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseAmount(value: string): number {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.abs(number) : 0;
}

function createSplitDraft(row: MovementView, existing: MovementSplitView[]): SplitDraft[] {
  if (existing.length >= 2) {
    return existing.map((line) => ({
      amount: Math.abs(line.amount).toFixed(2).replace('.', ','),
      category: line.category,
      subcategory: line.subcategory,
      notes: line.notes,
    }));
  }

  const total = Math.abs(row.amount ?? 0);
  const first = Math.round((total / 2) * 100) / 100;
  const second = Math.round((total - first) * 100) / 100;
  return [
    { amount: first.toFixed(2).replace('.', ','), category: row.category, subcategory: row.subcategory, notes: '' },
    { amount: second.toFixed(2).replace('.', ','), category: '', subcategory: '', notes: '' },
  ];
}

export default function MovementsExplorer({ rows, initialSplits = {} }: { rows: MovementView[]; initialSplits?: Record<string, MovementSplitView[]> }) {
  const [localRows, setLocalRows] = useState(rows);
  const [splits, setSplits] = useState<Record<string, MovementSplitView[]>>(initialSplits);
  const [query, setQuery] = useState('');
  const [account, setAccount] = useState('all');
  const [status, setStatus] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
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
  const [splitSelected, setSplitSelected] = useState<MovementView | null>(null);
  const [splitLines, setSplitLines] = useState<SplitDraft[]>([]);
  const [splitSaving, setSplitSaving] = useState(false);
  const [splitError, setSplitError] = useState('');

  const accounts = useMemo(
    () => [...new Set(localRows.map((row) => row.account).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [localRows],
  );

  const categories = useMemo(() => {
    const values = new Set(localRows.map((row) => row.category).filter(Boolean));
    Object.values(splits).flat().forEach((line) => line.category && values.add(line.category));
    return [...values].sort((a, b) => a.localeCompare(b, 'es'));
  }, [localRows, splits]);

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());

    return localRows.filter((row) => {
      if (account !== 'all' && row.account !== account) return false;
      if (status === 'review' && row.reviewStatus !== 'pending') return false;
      if (status === 'ok' && row.reviewStatus === 'pending') return false;

      if (!needle) return true;
      const splitText = (splits[row.id] || []).map((line) => `${line.category} ${line.subcategory} ${line.amount}`).join(' ');
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
        splitText,
        row.amount === null ? '' : String(row.amount).replace('.', ','),
      ].join(' '));
      return haystack.includes(needle);
    });
  }, [account, localRows, query, splits, status]);

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  function resetVisibleRows() {
    setVisibleCount(PAGE_SIZE);
  }

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
    } catch {
      setError('No se ha podido restaurar el movimiento.');
    } finally {
      setSaving(false);
    }
  }

  function openSplitEditor(row: MovementView) {
    if (row.amount === null || row.amount === 0) return;
    setSplitSelected(row);
    setSplitLines(createSplitDraft(row, splits[row.id] || []));
    setSplitError('');
  }

  function closeSplitEditor() {
    if (splitSaving) return;
    setSplitSelected(null);
    setSplitError('');
  }

  function updateSplitLine(index: number, patch: Partial<SplitDraft>) {
    setSplitLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function addSplitLine() {
    if (splitLines.length >= 12) return;
    setSplitLines((current) => [...current, { amount: '', category: '', subcategory: '', notes: '' }]);
  }

  function removeSplitLine(index: number) {
    if (splitLines.length <= 2) return;
    setSplitLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function saveSplit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!splitSelected || splitSelected.amount === null) return;

    const target = Math.abs(splitSelected.amount);
    const total = splitLines.reduce((sum, line) => sum + parseAmount(line.amount), 0);
    if (splitLines.some((line) => !line.category.trim() || parseAmount(line.amount) <= 0)) {
      setSplitError('Cada parte necesita una categoría y un importe mayor que cero.');
      return;
    }
    if (Math.abs(total - target) > 0.01) {
      setSplitError(`Las partes suman ${euro.format(total)}, pero el movimiento es de ${euro.format(target)}.`);
      return;
    }

    setSplitSaving(true);
    setSplitError('');
    const sign = Math.sign(splitSelected.amount) || 1;

    try {
      const response = await fetch('/api/private/split', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId: splitSelected.id,
          sourceAmount: splitSelected.amount,
          lines: splitLines.map((line) => ({
            amount: Math.round(parseAmount(line.amount) * sign * 100) / 100,
            category: line.category.trim(),
            subcategory: line.subcategory.trim(),
            notes: line.notes.trim(),
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || 'split-save-failed');

      const saved: MovementSplitView[] = splitLines.map((line, index) => ({
        lineNo: index + 1,
        amount: Math.round(parseAmount(line.amount) * sign * 100) / 100,
        category: line.category.trim(),
        subcategory: line.subcategory.trim(),
        notes: line.notes.trim(),
      }));
      setSplits((current) => ({ ...current, [splitSelected.id]: saved }));
      setSplitSelected(null);
    } catch {
      setSplitError('No se ha podido guardar la división. El movimiento original sigue intacto.');
    } finally {
      setSplitSaving(false);
    }
  }

  async function removeSplit() {
    if (!splitSelected || splitSaving || !(splits[splitSelected.id]?.length >= 2)) return;
    if (!window.confirm('¿Eliminar esta división? El movimiento volverá a analizarse con su categoría principal.')) return;
    setSplitSaving(true);
    setSplitError('');

    try {
      const response = await fetch(`/api/private/split?sourceId=${encodeURIComponent(splitSelected.id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('split-delete-failed');
      setSplits((current) => {
        const next = { ...current };
        delete next[splitSelected.id];
        return next;
      });
      setSplitSelected(null);
    } catch {
      setSplitError('No se ha podido eliminar la división.');
    } finally {
      setSplitSaving(false);
    }
  }

  const splitTotal = splitLines.reduce((sum, line) => sum + parseAmount(line.amount), 0);
  const splitTarget = Math.abs(splitSelected?.amount ?? 0);
  const splitDifference = Math.round((splitTarget - splitTotal) * 100) / 100;

  return (
    <>
      <div className="toolbar">
        <input
          className="control search"
          aria-label="Buscar movimientos"
          placeholder="Buscar concepto, comercio, importe o categoría"
          value={query}
          onChange={(event) => { setQuery(event.target.value); resetVisibleRows(); }}
        />
        <select className="control" aria-label="Filtrar por cuenta" value={account} onChange={(event) => { setAccount(event.target.value); resetVisibleRows(); }}>
          <option value="all">Todas las cuentas</option>
          {accounts.map((name) => <option value={name} key={name}>{name}</option>)}
        </select>
        <select className="control" aria-label="Filtrar por estado" value={status} onChange={(event) => { setStatus(event.target.value); resetVisibleRows(); }}>
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
          <>
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
                  {visibleRows.map((row) => {
                    const rowSplits = splits[row.id] || [];
                    return (
                      <tr key={row.id || `${row.date}-${row.account}-${row.concept}-${row.amount}`}>
                        <td className="date-cell">{row.date}</td>
                        <td>
                          <div className="table-primary">{row.merchant || row.concept || 'Sin concepto'} {row.hasOverride && <span className="edited-dot" title="Con ajustes internos">●</span>}</div>
                          <div className="table-secondary">{row.merchant && row.concept !== row.merchant ? row.concept : row.channel}</div>
                        </td>
                        <td>
                          {rowSplits.length >= 2 ? (
                            <><div className="table-primary split-label">Dividido en {rowSplits.length} partes</div><div className="table-secondary">{rowSplits.map((line) => line.category).join(' · ')}</div></>
                          ) : (
                            <><div className="table-primary">{row.category || 'Sin categoría'}</div><div className="table-secondary">{row.subcategory}</div></>
                          )}
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
                        <td className="numeric movement-actions">
                          {row.amount !== null && row.amount !== 0 && <button type="button" className="small-button" onClick={() => openSplitEditor(row)}>{rowSplits.length >= 2 ? 'División' : 'Dividir'}</button>}
                          <button type="button" className="small-button" onClick={() => openEditor(row)}>Editar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visibleRows.length < filtered.length && (
              <div className="row table-summary-row">
                <div className="row-meta">Mostrando {visibleRows.length.toLocaleString('es-ES')} de {filtered.length.toLocaleString('es-ES')}</div>
                <button type="button" className="secondary-button" onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, filtered.length))}>Mostrar 100 más</button>
              </div>
            )}
          </>
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

      {splitSelected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeSplitEditor()}>
          <section className="editor-panel split-editor-panel" role="dialog" aria-modal="true" aria-labelledby="split-editor-title">
            <div className="editor-header">
              <div>
                <div className="eyebrow">División de movimiento</div>
                <h2 id="split-editor-title" className="editor-title">Repartir entre categorías</h2>
                <div className="row-meta">{splitSelected.date} · {splitSelected.merchant || splitSelected.concept} · {euro.format(Math.abs(splitSelected.amount ?? 0))}</div>
              </div>
              <button type="button" className="icon-button" onClick={closeSplitEditor} aria-label="Cerrar">×</button>
            </div>

            <div className="editor-source-note">La suma de las partes debe coincidir exactamente con el movimiento. El importe y el saldo bancario originales no se modifican.</div>

            <form onSubmit={saveSplit} className="form-stack">
              <div className="split-summary">
                <div><span>Movimiento</span><strong>{euro.format(splitTarget)}</strong></div>
                <div><span>Asignado</span><strong>{euro.format(splitTotal)}</strong></div>
                <div className={Math.abs(splitDifference) <= 0.01 ? 'split-balanced' : 'split-unbalanced'}><span>Por repartir</span><strong>{euro.format(splitDifference)}</strong></div>
              </div>

              <div className="split-lines">
                {splitLines.map((line, index) => (
                  <div className="split-line" key={index}>
                    <div className="split-line-number">{index + 1}</div>
                    <label className="form-field split-amount-field"><span>Importe</span><input className="control" inputMode="decimal" value={line.amount} onChange={(event) => updateSplitLine(index, { amount: event.target.value })} /></label>
                    <label className="form-field"><span>Categoría</span><input className="control" list="split-categories" value={line.category} onChange={(event) => updateSplitLine(index, { category: event.target.value })} /></label>
                    <label className="form-field"><span>Subcategoría</span><input className="control" value={line.subcategory} onChange={(event) => updateSplitLine(index, { subcategory: event.target.value })} /></label>
                    <button type="button" className="icon-button split-remove" onClick={() => removeSplitLine(index)} disabled={splitLines.length <= 2 || splitSaving} aria-label={`Eliminar parte ${index + 1}`}>×</button>
                  </div>
                ))}
              </div>
              <datalist id="split-categories">{categories.map((item) => <option value={item} key={item} />)}</datalist>

              <button type="button" className="secondary-button split-add" onClick={addSplitLine} disabled={splitLines.length >= 12 || splitSaving}>+ Añadir otra parte</button>
              {splitError && <div className="form-error" role="alert">{splitError}</div>}

              <div className="editor-actions">
                {(splits[splitSelected.id]?.length || 0) >= 2 && <button type="button" className="danger-ghost-button" onClick={removeSplit} disabled={splitSaving}>Eliminar división</button>}
                <div className="editor-actions-right">
                  <button type="button" className="secondary-button" onClick={closeSplitEditor} disabled={splitSaving}>Cancelar</button>
                  <button type="submit" className="primary-inline-button" disabled={splitSaving || Math.abs(splitDifference) > 0.01}>{splitSaving ? 'Guardando…' : 'Guardar división'}</button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
