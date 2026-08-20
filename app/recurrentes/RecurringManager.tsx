'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type RecurringStatus = 'auto' | 'confirmed' | 'ignored';

export interface RecurringView {
  key: string;
  description: string;
  category: string;
  averageAmount: number;
  expectedAmount: number;
  intervalDays: number;
  occurrences: number;
  lastDate: string;
  nextDate: string;
  confidence: number;
  status: RecurringStatus;
  displayName: string;
  notes: string;
  customized: boolean;
}

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function normalize(value: string): string {
  return value.toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function amountFromInput(value: string): number {
  return Number(value.replace(',', '.'));
}

function statusLabel(status: RecurringStatus): string {
  if (status === 'confirmed') return 'Confirmado';
  if (status === 'ignored') return 'Ignorado';
  return 'Detectado';
}

export default function RecurringManager({ initialRows, categories }: { initialRows: RecurringView[]; categories: string[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'active' | 'all' | 'confirmed' | 'ignored'>('active');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [category, setCategory] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [status, setStatus] = useState<RecurringStatus>('auto');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    return rows.filter((row) => {
      if (filter === 'active' && row.status === 'ignored') return false;
      if (filter === 'confirmed' && row.status !== 'confirmed') return false;
      if (filter === 'ignored' && row.status !== 'ignored') return false;
      if (!needle) return true;
      return normalize(`${row.displayName} ${row.description} ${row.category} ${row.expectedAmount}`).includes(needle);
    });
  }, [filter, query, rows]);

  const summary = useMemo(() => rows.reduce((result, row) => {
    if (row.status === 'ignored') return result;
    if (row.expectedAmount < 0) result.expenses += Math.abs(row.expectedAmount);
    if (row.expectedAmount > 0) result.income += row.expectedAmount;
    if (row.status === 'confirmed') result.confirmed += 1;
    result.active += 1;
    return result;
  }, { expenses: 0, income: 0, confirmed: 0, active: 0 }), [rows]);

  function openEditor(row: RecurringView) {
    setEditingKey(row.key);
    setDisplayName(row.displayName);
    setExpectedAmount(String(row.expectedAmount));
    setCategory(row.category);
    setNextDate(row.nextDate);
    setStatus(row.status);
    setNotes(row.notes);
    setError('');
  }

  function closeEditor() {
    setEditingKey(null);
    setError('');
  }

  async function persist(row: RecurringView, changes: Partial<Pick<RecurringView, 'displayName' | 'expectedAmount' | 'category' | 'nextDate' | 'status' | 'notes'>>) {
    const next = { ...row, ...changes };
    const response = await fetch('/api/private/recurring', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patternKey: row.key,
        status: next.status,
        displayName: next.displayName === row.description ? null : next.displayName,
        expectedAmount: Math.abs(next.expectedAmount - row.averageAmount) < 0.005 ? null : next.expectedAmount,
        category: next.category,
        nextExpectedDate: next.nextDate || null,
        notes: next.notes,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok || !body.preference) throw new Error('save-failed');
    const saved = body.preference;
    const updated: RecurringView = {
      ...row,
      displayName: saved.display_name || row.description,
      expectedAmount: saved.expected_amount == null ? row.averageAmount : Number(saved.expected_amount),
      category: saved.category || row.category,
      nextDate: saved.next_expected_date || row.nextDate,
      status: saved.status,
      notes: saved.notes || '',
      customized: true,
    };
    setRows((current) => current.map((item) => item.key === row.key ? updated : item));
    router.refresh();
    return updated;
  }

  async function quickStatus(row: RecurringView, nextStatus: RecurringStatus) {
    setError('');
    try {
      await persist(row, { status: nextStatus });
    } catch {
      setError('No se ha podido actualizar el recurrente.');
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const row = rows.find((item) => item.key === editingKey);
    const amount = amountFromInput(expectedAmount);
    if (!row || !displayName.trim() || !Number.isFinite(amount) || amount === 0 || (nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate))) {
      setError('Revisa el nombre, importe y fecha prevista.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await persist(row, {
        displayName: displayName.trim(),
        expectedAmount: amount,
        category: category.trim(),
        nextDate,
        status,
        notes,
      });
      closeEditor();
    } catch {
      setError('No se han podido guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }

  async function resetPreference(row: RecurringView) {
    if (!window.confirm(`¿Restaurar “${row.displayName}” a la detección automática?`)) return;
    setError('');
    try {
      const response = await fetch(`/api/private/recurring?patternKey=${encodeURIComponent(row.key)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('reset-failed');
      setRows((current) => current.map((item) => item.key === row.key ? {
        ...item,
        displayName: item.description,
        expectedAmount: item.averageAmount,
        status: 'auto',
        notes: '',
        customized: false,
      } : item));
      if (editingKey === row.key) closeEditor();
      router.refresh();
    } catch {
      setError('No se ha podido restaurar la detección automática.');
    }
  }

  const editing = rows.find((row) => row.key === editingKey) || null;

  return (
    <>
      <section className="grid grid-4">
        <article className="card"><div className="metric-label">Recurrentes activos</div><div className="metric-value">{summary.active}</div><p className="metric-note">Ingresos y gastos mensuales detectados</p></article>
        <article className="card"><div className="metric-label">Gasto recurrente estimado</div><div className="metric-value amount-negative">{euro.format(summary.expenses)}</div><p className="metric-note">Aproximación mensual, sin traspasos</p></article>
        <article className="card"><div className="metric-label">Ingreso recurrente estimado</div><div className="metric-value amount-positive">{euro.format(summary.income)}</div><p className="metric-note">Aproximación mensual detectada</p></article>
        <article className="card"><div className="metric-label">Confirmados por ti</div><div className="metric-value">{summary.confirmed}</div><p className="metric-note">Tienen prioridad en la previsión</p></article>
      </section>

      <div className="toolbar section-gap recurring-toolbar">
        <input className="control search" aria-label="Buscar recurrentes" placeholder="Buscar recibo, suscripción, categoría o importe" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="control" aria-label="Filtrar recurrentes" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
          <option value="active">Activos</option>
          <option value="all">Todos</option>
          <option value="confirmed">Confirmados</option>
          <option value="ignored">Ignorados</option>
        </select>
      </div>

      {error && <div className="status-panel status-danger"><div><div className="status-title">No se ha podido completar la acción</div><div className="status-copy">{error}</div></div></div>}

      <section className="card recurring-list-card">
        <div className="card-heading-row">
          <div><div className="eyebrow">Control recurrente</div><h2 className="section-title">Recibos, suscripciones e ingresos habituales</h2></div>
          <span className="badge">{filtered.length} visibles</span>
        </div>
        {filtered.length === 0 ? <div className="empty compact-empty">No hay recurrentes que coincidan con este filtro.</div> : (
          <div className="recurring-list">
            {filtered.map((row) => (
              <article className={`recurring-item recurring-${row.status}`} key={row.key}>
                <div className="recurring-main">
                  <div className="recurring-copy">
                    <div className="recurring-title-row"><div className="row-title">{row.displayName}</div>{row.customized && <span className="edited-dot" title="Personalizado">●</span>}</div>
                    <div className="row-meta">{row.category || 'Sin categoría'} · {row.occurrences} apariciones · cada ~{row.intervalDays} días · confianza {Math.round(row.confidence * 100)}%</div>
                    <div className="row-meta">Último: {row.lastDate}{row.nextDate ? ` · Próximo: ${row.nextDate}` : ''}</div>
                  </div>
                  <div className="recurring-amount-block">
                    <div className={`amount recurring-amount ${row.expectedAmount < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(row.expectedAmount)}</div>
                    <span className={`state ${row.status === 'confirmed' ? 'state-ok' : row.status === 'ignored' ? 'state-muted' : 'state-review'}`}>{statusLabel(row.status)}</span>
                  </div>
                </div>
                <div className="recurring-actions">
                  {row.status !== 'confirmed' && <button type="button" className="small-button" onClick={() => quickStatus(row, 'confirmed')}>Confirmar</button>}
                  {row.status !== 'ignored' && <button type="button" className="secondary-button recurring-small" onClick={() => quickStatus(row, 'ignored')}>Ignorar</button>}
                  <button type="button" className="small-button" onClick={() => openEditor(row)}>Editar</button>
                  {row.customized && <button type="button" className="danger-ghost-button small-danger" onClick={() => resetPreference(row)}>Restaurar auto</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeEditor(); }}>
          <form className="editor-panel" onSubmit={save} aria-label="Editar recurrente">
            <div className="editor-header">
              <div><div className="eyebrow">Recurrente</div><h2 className="editor-title">Ajustar previsión</h2><div className="row-meta">{editing.description}</div></div>
              <button type="button" className="icon-button" aria-label="Cerrar" onClick={closeEditor}>×</button>
            </div>
            <div className="editor-source-note">Los cambios solo afectan a tu capa privada y a las previsiones. Los movimientos bancarios históricos permanecen intactos.</div>
            <div className="form-stack">
              <label className="form-field"><span>Nombre</span><input className="control" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
              <div className="form-grid">
                <label className="form-field"><span>Importe esperado (€)</span><input className="control" inputMode="decimal" value={expectedAmount} onChange={(event) => setExpectedAmount(event.target.value)} /></label>
                <label className="form-field"><span>Próxima fecha</span><input className="control" type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></label>
              </div>
              <div className="form-grid">
                <label className="form-field"><span>Categoría</span><input className="control" list="recurring-categories" value={category} onChange={(event) => setCategory(event.target.value)} /></label>
                <label className="form-field"><span>Estado</span><select className="control" value={status} onChange={(event) => setStatus(event.target.value as RecurringStatus)}><option value="auto">Detección automática</option><option value="confirmed">Confirmado</option><option value="ignored">Ignorado</option></select></label>
              </div>
              <label className="form-field"><span>Notas</span><textarea className="control textarea" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              {error && <div className="form-error" role="alert">{error}</div>}
              <div className="editor-actions"><div>{editing.customized && <button type="button" className="danger-ghost-button" onClick={() => resetPreference(editing)}>Restaurar automático</button>}</div><div className="editor-actions-right"><button type="button" className="secondary-button" onClick={closeEditor} disabled={saving}>Cancelar</button><button type="submit" className="primary-inline-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div></div>
            </div>
            <datalist id="recurring-categories">{categories.map((value) => <option value={value} key={value} />)}</datalist>
          </form>
        </div>
      )}
    </>
  );
}
