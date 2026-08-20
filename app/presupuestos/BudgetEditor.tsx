'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface BudgetCategoryView {
  category: string;
  spent: number;
  transactions: number;
  assigned: number;
}

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default function BudgetEditor({ yearMonth, rows }: { yearMonth: string; rows: BudgetCategoryView[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((row) => [row.category, row.assigned ? String(row.assigned) : ''])));
  const [saved, setSaved] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((row) => [row.category, row.assigned])));
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const assigned = rows.reduce((sum, row) => sum + (saved[row.category] ?? 0), 0);
    const spent = rows.reduce((sum, row) => sum + row.spent, 0);
    return { assigned, spent, remaining: assigned - spent };
  }, [rows, saved]);

  async function save(category: string) {
    const raw = values[category] ?? '';
    const assigned = raw.trim() === '' ? 0 : Number(raw.replace(',', '.'));
    if (!Number.isFinite(assigned) || assigned < 0) {
      setError('Introduce un presupuesto válido igual o superior a 0.');
      return;
    }

    setSaving(category);
    setError('');
    try {
      const response = await fetch('/api/private/budget', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yearMonth, category, assigned }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('save-failed');
      setSaved((current) => ({ ...current, [category]: assigned }));
      setValues((current) => ({ ...current, [category]: assigned ? String(assigned) : '' }));
      router.refresh();
    } catch {
      setError('No se ha podido guardar el presupuesto.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <section className="grid grid-3">
        <article className="card">
          <div className="metric-label">Presupuesto asignado</div>
          <div className="metric-value">{euro.format(totals.assigned)}</div>
          <p className="metric-note">Dinero planificado para {yearMonth}</p>
        </article>
        <article className="card">
          <div className="metric-label">Gastado</div>
          <div className="metric-value">{euro.format(totals.spent)}</div>
          <p className="metric-note">Gasto real, sin traspasos ni exclusiones</p>
        </article>
        <article className="card">
          <div className="metric-label">Disponible presupuestado</div>
          <div className={`metric-value ${totals.remaining < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(totals.remaining)}</div>
          <p className="metric-note">Asignado menos gastado</p>
        </article>
      </section>

      <section className="card section-gap">
        <div className="card-heading-row">
          <div>
            <div className="eyebrow">Plan mensual</div>
            <h2 className="section-title">Presupuesto por categoría</h2>
          </div>
          <span className="badge">Editable</span>
        </div>
        <p className="metric-note budget-note">Las asignaciones se guardan en la aplicación y nunca modifican la hoja bancaria.</p>
        {error && <div className="form-error budget-error" role="alert">{error}</div>}
        <div className="budget-list">
          {rows.map((row) => {
            const assigned = saved[row.category] ?? 0;
            const remaining = assigned - row.spent;
            const percent = assigned > 0 ? Math.min(100, (row.spent / assigned) * 100) : 0;
            const over = assigned > 0 && row.spent > assigned;
            return (
              <div className="budget-row" key={row.category}>
                <div className="budget-category">
                  <div className="row-title">{row.category}</div>
                  <div className="row-meta">{row.transactions} movimientos · {euro.format(row.spent)} gastados</div>
                  <div className={`progress category-progress ${over ? 'progress-over' : ''}`}><span style={{ width: `${percent}%` }} /></div>
                </div>
                <div className="budget-values">
                  <label className="budget-input-label">
                    <span>Asignado</span>
                    <div className="money-input-wrap">
                      <input
                        className="control budget-input"
                        inputMode="decimal"
                        value={values[row.category] ?? ''}
                        placeholder="0,00"
                        onChange={(event) => setValues((current) => ({ ...current, [row.category]: event.target.value }))}
                        onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), save(row.category))}
                      />
                      <span>€</span>
                    </div>
                  </label>
                  <div className="budget-remaining">
                    <span>Disponible</span>
                    <strong className={remaining < 0 ? 'amount-negative' : ''}>{assigned > 0 ? euro.format(remaining) : 'Sin asignar'}</strong>
                  </div>
                  <button type="button" className="small-button budget-save" onClick={() => save(row.category)} disabled={saving === row.category}>
                    {saving === row.category ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
