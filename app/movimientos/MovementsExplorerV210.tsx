'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedCursor } from '../../src/normalized/client';

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
  accountKey: string;
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

export interface MovementAccountOption {
  accountKey: string;
  name: string;
}

interface MovementPagePayload {
  ok: boolean;
  items: Array<MovementView & { splits?: MovementSplitView[] }>;
  total: number | null;
  hasMore: boolean;
  nextCursor: NormalizedCursor | null;
  error?: string;
}

interface SplitDraft {
  amount: string;
  category: string;
  subcategory: string;
  notes: string;
}

const PAGE_SIZE = 100;
const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

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

function splitIndex(items: Array<MovementView & { splits?: MovementSplitView[] }>) {
  return Object.fromEntries(items.filter((row) => (row.splits?.length || 0) > 0).map((row) => [row.id, row.splits || []]));
}

function stripSplits(items: Array<MovementView & { splits?: MovementSplitView[] }>): MovementView[] {
  return items.map(({ splits: _splits, ...row }) => row);
}

export default function MovementsExplorerV210({
  initialRows,
  initialSplits,
  initialTotal,
  initialCursor,
  initialHasMore,
  accountOptions,
}: {
  initialRows: MovementView[];
  initialSplits: Record<string, MovementSplitView[]>;
  initialTotal: number;
  initialCursor: NormalizedCursor | null;
  initialHasMore: boolean;
  accountOptions: MovementAccountOption[];
}) {
  const [localRows, setLocalRows] = useState(initialRows);
  const [splits, setSplits] = useState(initialSplits);
  const [total, setTotal] = useState(initialTotal);
  const [nextCursor, setNextCursor] = useState<NormalizedCursor | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pageCursor, setPageCursor] = useState<NormalizedCursor | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<NormalizedCursor | null>>([]);
  const [query, setQuery] = useState('');
  const [accountKey, setAccountKey] = useState('all');
  const [status, setStatus] = useState<'all' | 'review' | 'ok'>('all');
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageError, setPageError] = useState('');
  const firstFilterRun = useRef(true);
  const requestSequence = useRef(0);

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

  const categories = useMemo(() => {
    const values = new Set(localRows.map((row) => row.category).filter(Boolean));
    Object.values(splits).flat().forEach((line) => line.category && values.add(line.category));
    return [...values].sort((a, b) => a.localeCompare(b, 'es'));
  }, [localRows, splits]);

  async function readPage(cursor: NormalizedCursor | null, includeTotal: boolean, signal?: AbortSignal) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), status });
    if (query.trim()) params.set('q', query.trim());
    if (accountKey !== 'all') params.set('accountKey', accountKey);
    if (!includeTotal) params.set('includeTotal', '0');
    if (cursor) {
      params.set('cursorDate', cursor.date);
      params.set('cursorPosition', String(cursor.position));
      params.set('cursorId', cursor.id);
    }
    const response = await fetch(`/api/normalized/movements?${params.toString()}`, { cache: 'no-store', signal });
    const body = (await response.json().catch(() => ({}))) as MovementPagePayload;
    if (!response.ok || !body.ok || !Array.isArray(body.items)) throw new Error(body.error || 'page-load-failed');
    return body;
  }

  function applyPage(body: MovementPagePayload, cursor: NormalizedCursor | null, history: Array<NormalizedCursor | null>, keepTotal = false) {
    setLocalRows(stripSplits(body.items));
    setSplits(splitIndex(body.items));
    if (!keepTotal && typeof body.total === 'number') setTotal(body.total);
    setNextCursor(body.nextCursor || null);
    setHasMore(Boolean(body.hasMore));
    setPageCursor(cursor);
    setCursorHistory(history);
    setPageError('');
  }

  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false;
      return;
    }
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingPage(true);
      setPageError('');
      try {
        const body = await readPage(null, true, controller.signal);
        if (requestSequence.current === sequence) applyPage(body, null, []);
      } catch (loadError) {
        if ((loadError as Error)?.name !== 'AbortError' && requestSequence.current === sequence) {
          setPageError('No se han podido actualizar los movimientos. Puedes reintentar sin perder ningún cambio.');
        }
      } finally {
        if (requestSequence.current === sequence) setLoadingPage(false);
      }
    }, query.trim() ? 280 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, accountKey, status]);

  async function goNext() {
    if (!hasMore || !nextCursor || loadingPage) return;
    setLoadingPage(true);
    setPageError('');
    try {
      const target = nextCursor;
      const body = await readPage(target, false);
      applyPage(body, target, [...cursorHistory, pageCursor], true);
    } catch {
      setPageError('No se ha podido cargar la página siguiente.');
    } finally {
      setLoadingPage(false);
    }
  }

  async function goPrevious() {
    if (cursorHistory.length === 0 || loadingPage) return;
    const history = cursorHistory.slice(0, -1);
    const target = cursorHistory[cursorHistory.length - 1] ?? null;
    setLoadingPage(true);
    setPageError('');
    try {
      const body = await readPage(target, false);
      applyPage(body, target, history, true);
    } catch {
      setPageError('No se ha podido volver a la página anterior.');
    } finally {
      setLoadingPage(false);
    }
  }

  async function retryPage() {
    setLoadingPage(true);
    setPageError('');
    try {
      const body = await readPage(pageCursor, true);
      applyPage(body, pageCursor, cursorHistory);
    } catch {
      setPageError('La recarga ha vuelto a fallar.');
    } finally {
      setLoadingPage(false);
    }
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

  function rowMatchesStatus(row: MovementView) {
    if (status === 'review') return row.reviewStatus === 'pending';
    if (status === 'ok') return row.reviewStatus !== 'pending';
    return true;
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
        body: JSON.stringify({ sourceId: selected.id, category, subcategory, merchant, notes, reviewStatus, reconciled, excludedFromAnalytics: excluded }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('save-failed');
      const updated: MovementView = {
        ...selected,
        category: category.trim() || selected.sourceCategory,
        subcategory: subcategory.trim() || selected.sourceSubcategory,
        merchant: merchant.trim() || selected.sourceMerchant,
        notes: notes.trim(), reviewStatus, reconciled, excludedFromAnalytics: excluded, hasOverride: true,
      };
      setLocalRows((current) => rowMatchesStatus(updated)
        ? current.map((row) => row.id === selected.id ? updated : row)
        : current.filter((row) => row.id !== selected.id));
      if (!rowMatchesStatus(updated)) setTotal((value) => Math.max(0, value - 1));
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
      const restored: MovementView = {
        ...selected,
        category: selected.sourceCategory,
        subcategory: selected.sourceSubcategory,
        merchant: selected.sourceMerchant,
        notes: '',
        reviewStatus: selected.sourceReviewStatus,
        reconciled: selected.sourceReconciled,
        excludedFromAnalytics: false,
        hasOverride: false,
      };
      setLocalRows((current) => rowMatchesStatus(restored)
        ? current.map((row) => row.id === selected.id ? restored : row)
        : current.filter((row) => row.id !== selected.id));
      if (!rowMatchesStatus(restored)) setTotal((value) => Math.max(0, value - 1));
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
    if (splitLines.length < 12) setSplitLines((current) => [...current, { amount: '', category: '', subcategory: '', notes: '' }]);
  }

  function removeSplitLine(index: number) {
    if (splitLines.length > 2) setSplitLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function saveSplit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!splitSelected || splitSelected.amount === null) return;
    const target = Math.abs(splitSelected.amount);
    const totalSplit = splitLines.reduce((sum, line) => sum + parseAmount(line.amount), 0);
    if (splitLines.some((line) => !line.category.trim() || parseAmount(line.amount) <= 0)) {
      setSplitError('Cada parte necesita una categoría y un importe mayor que cero.'); return;
    }
    if (Math.abs(totalSplit - target) > 0.01) {
      setSplitError(`Las partes suman ${euro.format(totalSplit)}, pero el movimiento es de ${euro.format(target)}.`); return;
    }
    setSplitSaving(true); setSplitError('');
    const sign = Math.sign(splitSelected.amount) || 1;
    try {
      const response = await fetch('/api/private/split', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId: splitSelected.id, sourceAmount: splitSelected.amount,
          lines: splitLines.map((line) => ({ amount: Math.round(parseAmount(line.amount) * sign * 100) / 100, category: line.category.trim(), subcategory: line.subcategory.trim(), notes: line.notes.trim() })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('split-save-failed');
      const saved = splitLines.map((line, index) => ({ lineNo: index + 1, amount: Math.round(parseAmount(line.amount) * sign * 100) / 100, category: line.category.trim(), subcategory: line.subcategory.trim(), notes: line.notes.trim() }));
      setSplits((current) => ({ ...current, [splitSelected.id]: saved }));
      setSplitSelected(null);
    } catch {
      setSplitError('No se ha podido guardar la división. El movimiento original sigue intacto.');
    } finally { setSplitSaving(false); }
  }

  async function removeSplit() {
    if (!splitSelected || splitSaving || !(splits[splitSelected.id]?.length >= 2)) return;
    if (!window.confirm('¿Eliminar esta división? El movimiento volverá a analizarse con su categoría principal.')) return;
    setSplitSaving(true); setSplitError('');
    try {
      const response = await fetch(`/api/private/split?sourceId=${encodeURIComponent(splitSelected.id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('split-delete-failed');
      setSplits((current) => { const next = { ...current }; delete next[splitSelected.id]; return next; });
      setSplitSelected(null);
    } catch { setSplitError('No se ha podido eliminar la división.'); }
    finally { setSplitSaving(false); }
  }

  const splitTotal = splitLines.reduce((sum, line) => sum + parseAmount(line.amount), 0);
  const splitTarget = Math.abs(splitSelected?.amount ?? 0);
  const splitDifference = Math.round((splitTarget - splitTotal) * 100) / 100;
  const pageNumber = cursorHistory.length + 1;
  const from = total === 0 ? 0 : (pageNumber - 1) * PAGE_SIZE + 1;
  const to = total === 0 ? 0 : Math.min(from + localRows.length - 1, total);

  return (
    <>
      <div className="toolbar">
        <input className="control search" aria-label="Buscar movimientos" placeholder="Buscar concepto, comercio, importe o categoría" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="control" aria-label="Filtrar por cuenta" value={accountKey} onChange={(event) => setAccountKey(event.target.value)}>
          <option value="all">Todas las cuentas</option>
          {accountOptions.map((option) => <option value={option.accountKey} key={option.accountKey}>{option.name}</option>)}
        </select>
        <select className="control" aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value as 'all' | 'review' | 'ok')}>
          <option value="all">Todos los estados</option><option value="review">Pendientes de revisar</option><option value="ok">Sin revisión pendiente</option>
        </select>
      </div>

      {pageError && <div className="status-panel status-danger"><div><div className="status-title">No se ha podido actualizar esta página</div><div className="status-copy">La página ya cargada se mantiene intacta.</div></div><button type="button" className="secondary-button" onClick={retryPage} disabled={loadingPage}>Reintentar</button></div>}

      <section className="card table-card" aria-busy={loadingPage}>
        <div className="row table-summary-row">
          <div><div className="row-title">Movimientos</div><div className="row-meta">{from.toLocaleString('es-ES')}–{to.toLocaleString('es-ES')} de {total.toLocaleString('es-ES')} operaciones · página {pageNumber}</div></div>
          <span className="badge">{loadingPage ? 'Actualizando…' : 'Lectura paginada · fuente protegida'}</span>
        </div>
        {localRows.length === 0 ? <div className="empty section-gap">No hay movimientos que coincidan con los filtros.</div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Cuenta</th><th className="numeric">Importe</th><th className="numeric">Saldo</th><th>Estado</th><th aria-label="Acciones" /></tr></thead><tbody>
          {localRows.map((row) => { const rowSplits = splits[row.id] || []; return <tr key={row.id}>
            <td className="date-cell">{row.date}</td>
            <td><div className="table-primary">{row.merchant || row.concept || 'Sin concepto'} {row.hasOverride && <span className="edited-dot" title="Con ajustes internos">●</span>}</div><div className="table-secondary">{row.merchant && row.concept !== row.merchant ? row.concept : row.channel}</div></td>
            <td>{rowSplits.length >= 2 ? <><div className="table-primary split-label">Dividido en {rowSplits.length} partes</div><div className="table-secondary">{rowSplits.map((line) => line.category).join(' · ')}</div></> : <><div className="table-primary">{row.category || 'Sin categoría'}</div><div className="table-secondary">{row.subcategory}</div></>}</td>
            <td>{row.account}</td>
            <td className={`numeric amount ${row.amount !== null && row.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>{row.amount === null ? '—' : euro.format(row.amount)}</td>
            <td className="numeric">{row.balance === null ? '—' : euro.format(row.balance)}</td>
            <td>{row.reviewStatus === 'pending' ? <span className="state state-review">Revisar</span> : <span className="state state-ok">{row.reviewStatus === 'ignored' ? 'Ignorado' : 'Revisado'}</span>}</td>
            <td className="numeric movement-actions">{row.amount !== null && row.amount !== 0 && <button type="button" className="small-button" onClick={() => openSplitEditor(row)}>{rowSplits.length >= 2 ? 'División' : 'Dividir'}</button>}<button type="button" className="small-button" onClick={() => openEditor(row)}>Editar</button></td>
          </tr>; })}
        </tbody></table></div>}
        <div className="row table-summary-row"><div className="row-meta">Máximo {PAGE_SIZE} movimientos renderizados por página.</div><div className="editor-actions-right"><button type="button" className="secondary-button" onClick={goPrevious} disabled={cursorHistory.length === 0 || loadingPage}>Anterior</button><button type="button" className="secondary-button" onClick={goNext} disabled={!hasMore || !nextCursor || loadingPage}>Siguiente</button></div></div>
      </section>

      {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeEditor()}><section className="editor-panel" role="dialog" aria-modal="true" aria-labelledby="movement-editor-title">
        <div className="editor-header"><div><div className="eyebrow">Copia de trabajo</div><h2 id="movement-editor-title" className="editor-title">Editar movimiento</h2><div className="row-meta">{selected.date} · {selected.account} · {selected.amount === null ? '—' : euro.format(selected.amount)}</div></div><button type="button" className="icon-button" onClick={closeEditor} aria-label="Cerrar">×</button></div>
        <div className="editor-source-note">El movimiento bancario original permanece intacto. Solo se guardan tus ajustes en la capa interna.</div>
        <form onSubmit={save} className="form-stack"><div className="form-grid"><label className="form-field"><span>Categoría</span><input className="control" list="movement-categories-v210" value={category} onChange={(event) => setCategory(event.target.value)} /><datalist id="movement-categories-v210">{categories.map((item) => <option value={item} key={item} />)}</datalist></label><label className="form-field"><span>Subcategoría</span><input className="control" value={subcategory} onChange={(event) => setSubcategory(event.target.value)} /></label></div>
          <label className="form-field"><span>Comercio o contraparte</span><input className="control" value={merchant} onChange={(event) => setMerchant(event.target.value)} /></label>
          <label className="form-field"><span>Notas</span><textarea className="control textarea" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <label className="form-field"><span>Estado de revisión</span><select className="control" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}><option value="pending">Pendiente de revisar</option><option value="reviewed">Revisado</option><option value="ignored">Ignorado</option></select></label>
          <div className="check-grid"><label className="check-row"><input type="checkbox" checked={reconciled} onChange={(event) => setReconciled(event.target.checked)} /><span>Conciliado</span></label><label className="check-row"><input type="checkbox" checked={excluded} onChange={(event) => setExcluded(event.target.checked)} /><span>Excluir de análisis y presupuestos</span></label></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="editor-actions">{selected.hasOverride && <button type="button" className="danger-ghost-button" onClick={restoreSource} disabled={saving}>Restaurar original</button>}<div className="editor-actions-right"><button type="button" className="secondary-button" onClick={closeEditor} disabled={saving}>Cancelar</button><button type="submit" className="primary-inline-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div></div>
        </form>
      </section></div>}

      {splitSelected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeSplitEditor()}><section className="editor-panel split-editor-panel" role="dialog" aria-modal="true" aria-labelledby="split-editor-title">
        <div className="editor-header"><div><div className="eyebrow">División de movimiento</div><h2 id="split-editor-title" className="editor-title">Repartir entre categorías</h2><div className="row-meta">{splitSelected.date} · {splitSelected.merchant || splitSelected.concept} · {euro.format(Math.abs(splitSelected.amount ?? 0))}</div></div><button type="button" className="icon-button" onClick={closeSplitEditor} aria-label="Cerrar">×</button></div>
        <div className="editor-source-note">La suma de las partes debe coincidir exactamente con el movimiento. El importe y el saldo bancario originales no se modifican.</div>
        <form onSubmit={saveSplit} className="form-stack"><div className="split-summary"><div><span>Movimiento</span><strong>{euro.format(splitTarget)}</strong></div><div><span>Asignado</span><strong>{euro.format(splitTotal)}</strong></div><div className={Math.abs(splitDifference) <= 0.01 ? 'split-balanced' : 'split-unbalanced'}><span>Por repartir</span><strong>{euro.format(splitDifference)}</strong></div></div>
          <div className="split-lines">{splitLines.map((line, index) => <div className="split-line" key={index}><div className="split-line-number">{index + 1}</div><label className="form-field split-amount-field"><span>Importe</span><input className="control" inputMode="decimal" value={line.amount} onChange={(event) => updateSplitLine(index, { amount: event.target.value })} /></label><label className="form-field"><span>Categoría</span><input className="control" list="split-categories-v210" value={line.category} onChange={(event) => updateSplitLine(index, { category: event.target.value })} /></label><label className="form-field"><span>Subcategoría</span><input className="control" value={line.subcategory} onChange={(event) => updateSplitLine(index, { subcategory: event.target.value })} /></label><button type="button" className="icon-button split-remove" onClick={() => removeSplitLine(index)} disabled={splitLines.length <= 2 || splitSaving} aria-label={`Eliminar parte ${index + 1}`}>×</button></div>)}</div>
          <datalist id="split-categories-v210">{categories.map((item) => <option value={item} key={item} />)}</datalist><button type="button" className="secondary-button split-add" onClick={addSplitLine} disabled={splitLines.length >= 12 || splitSaving}>+ Añadir otra parte</button>{splitError && <div className="form-error" role="alert">{splitError}</div>}
          <div className="editor-actions">{(splits[splitSelected.id]?.length || 0) >= 2 && <button type="button" className="danger-ghost-button" onClick={removeSplit} disabled={splitSaving}>Eliminar división</button>}<div className="editor-actions-right"><button type="button" className="secondary-button" onClick={closeSplitEditor} disabled={splitSaving}>Cancelar</button><button type="submit" className="primary-inline-button" disabled={splitSaving || Math.abs(splitDifference) > 0.01}>{splitSaving ? 'Guardando…' : 'Guardar división'}</button></div></div>
        </form>
      </section></div>}
    </>
  );
}
