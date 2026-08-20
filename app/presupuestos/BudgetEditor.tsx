'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface BudgetCategoryView {
  category: string;
  spent: number;
  transactions: number;
  assigned: number;
  carryIn: number;
  rollover: boolean;
}

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default function BudgetEditor({ yearMonth, rows, monthlyIncome }: { yearMonth: string; rows: BudgetCategoryView[]; monthlyIncome: number }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((row) => [row.category, row.assigned ? String(row.assigned) : ''])));
  const [saved, setSaved] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((row) => [row.category, row.assigned])));
  const [rollovers, setRollovers] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((row) => [row.category, row.rollover])));
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const assigned = rows.reduce((sum, row) => sum + (saved[row.category] ?? 0), 0);
    const spent = rows.reduce((sum, row) => sum + row.spent, 0);
    const carryIn = rows.reduce((sum, row) => sum + row.carryIn, 0);
    const available = assigned + carryIn - spent;
    const overspent = rows.reduce((sum, row) => {
      const envelopeAvailable = (saved[row.category] ?? 0) + row.carryIn - row.spent;
      return sum + Math.max(0, -envelopeAvailable);
    }, 0);
    return {
      assigned,
      spent,
      carryIn,
      available,
      overspent,
      toAssign: monthlyIncome - assigned,
    };
  }, [monthlyIncome, rows, saved]);

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
        body: JSON.stringify({ yearMonth, category, assigned, rollover: Boolean(rollovers[category]) }),
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
      <section className="grid grid-4">
        <article className="card">
          <div className="metric-label">Ingresos para presupuestar</div>
          <div className="metric-value amount-positive">{euro.format(monthlyIncome)}</div>
          <p className="metric-note">Ingresos reales del periodo, sin traspasos</p>
        </article>
        <article className="card">
          <div className="metric-label">Asignado</div>
          <div className="metric-value">{euro.format(totals.assigned)}</div>
          <p className="metric-note">Dinero al que ya has dado un trabajo</p>
        </article>
        <article className={`card${totals.toAssign < 0 ? ' risk-card' : ''}`}>
          <div className="metric-label">Disponible para asignar</div>
          <div className={`metric-value ${totals.toAssign < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(totals.toAssign)}</div>
          <p className="metric-note">Ingresos del mes menos asignaciones</p>
        </article>
        <article className={`card${totals.overspent > 0 ? ' risk-card' : ''}`}>
          <div className="metric-label">Disponible en categorías</div>
          <div className={`metric-value ${totals.available < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(totals.available)}</div>
          <p className="metric-note">{totals.carryIn > 0 ? `${euro.format(totals.carryIn)} arrastrados del mes anterior` : totals.overspent > 0 ? `${euro.format(totals.overspent)} sobregastados` : 'Asignado + remanentes - gasto real'}</p>
        </article>
      </section>

      {totals.toAssign < 0 && (
        <div className="status-panel status-danger section-gap">
          <div>
            <div className="status-title">Has asignado más dinero del que ha entrado este mes</div>
            <div className="status-copy">Reduce asignaciones en {euro.format(Math.abs(totals.toAssign))} para volver a un presupuesto equilibrado.</div>
          </div>
          <span className="status-chip">Sobreasignado</span>
        </div>
      )}

      <section className="card section-gap">
        <div className="card-heading-row">
          <div>
            <div className="eyebrow">Plan mensual</div>
            <h2 className="section-title">Sobres por categoría</h2>
          </div>
          <span className="badge">Cada euro con destino</span>
        </div>
        <p className="metric-note budget-note">Puedes arrastrar al mes siguiente lo que no gastes en una categoría. Las asignaciones se guardan en la aplicación y nunca modifican la hoja bancaria.</p>
        {error && <div className="form-error budget-error" role="alert">{error}</div>}
        <div className="budget-list">
          {rows.map((row) => {
            const assigned = saved[row.category] ?? 0;
            const envelope = assigned + row.carryIn;
            const remaining = envelope - row.spent;
            const percent = envelope > 0 ? Math.min(100, (row.spent / envelope) * 100) : 0;
            const over = row.spent > envelope && row.spent > 0;
            return (
              <div className="budget-row" key={row.category}>
                <div className="budget-category">
                  <div className="row-title">{row.category}</div>
                  <div className="row-meta">
                    {row.transactions} movimientos · {euro.format(row.spent)} gastados{row.carryIn > 0 ? ` · ${euro.format(row.carryIn)} heredados` : ''}
                  </div>
                  <div className={`progress category-progress ${over ? 'progress-over' : ''}`}><span style={{ width: `${percent}%` }} /></div>
                </div>
                <div className="budget-values budget-values-v2">
                  <label className="budget-input-label">
                    <span>Asignado este mes</span>
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
                    <strong className={remaining < 0 ? 'amount-negative' : 'amount-positive'}>{euro.format(remaining)}</strong>
                  </div>
                  <label className="budget-rollover">
                    <input
                      type="checkbox"
                      checked={Boolean(rollovers[row.category])}
                      onChange={(event) => setRollovers((current) => ({ ...current, [row.category]: event.target.checked }))}
                    />
                    <span>Arrastrar sobrante</span>
                  </label>
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
