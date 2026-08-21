'use client';

import { FormEvent, useMemo, useState } from 'react';
import { projectGoal, type GoalProjection } from '../../src/domain/goal-engine';
import { assessGoalFundingCapacity } from '../../src/domain/planning-capacity-engine';

export interface GoalView {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  monthlyContribution: number | null;
  active: boolean;
  notes: string;
}

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function numberFromInput(value: string): number {
  return Number(value.replace(',', '.'));
}

function projectionFor(goal: GoalView, asOfDate: string | null): GoalProjection | null {
  if (!asOfDate) return null;
  return projectGoal({
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    targetDate: goal.targetDate || null,
    monthlyContribution: goal.monthlyContribution,
    asOfDate,
  });
}

function projectionLabel(projection: GoalProjection | null, active: boolean): string {
  if (!active) return 'Pausado';
  if (!projection) return 'Sin proyección';
  if (projection.status === 'completed') return 'Completado';
  if (projection.status === 'on_track') return 'En plazo';
  if (projection.status === 'at_risk') return 'En riesgo';
  return 'Sin plan';
}

function projectionClass(projection: GoalProjection | null, active: boolean): string {
  if (!active || !projection || projection.status === 'no_plan') return 'state state-muted';
  if (projection.status === 'at_risk') return 'state state-warning';
  return 'state state-ok';
}

export default function GoalManager({ initialGoals, asOfDate, projectedMonthlyNet }: { initialGoals: GoalView[]; asOfDate: string | null; projectedMonthlyNet: number | null }) {
  const [goals, setGoals] = useState(initialGoals);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeProjections = useMemo(() => goals
    .filter((goal) => goal.active)
    .map((goal) => projectionFor(goal, asOfDate))
    .filter((projection): projection is GoalProjection => projection !== null), [goals, asOfDate]);

  const totals = useMemo(() => {
    const activeGoals = goals.filter((goal) => goal.active);
    return activeGoals.reduce((result, goal) => {
      const projection = projectionFor(goal, asOfDate);
      result.target += goal.targetAmount;
      result.current += goal.currentAmount;
      if (projection?.requiredMonthlyContribution != null && projection.status !== 'completed') {
        result.requiredMonthly += projection.requiredMonthlyContribution;
      }
      if (projection?.status === 'at_risk') result.atRisk += 1;
      return result;
    }, { target: 0, current: 0, requiredMonthly: 0, atRisk: 0 });
  }, [goals, asOfDate]);

  const fundingCapacity = useMemo(() => projectedMonthlyNet == null
    ? null
    : assessGoalFundingCapacity(activeProjections, projectedMonthlyNet), [activeProjections, projectedMonthlyNet]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setTargetAmount('');
    setCurrentAmount('');
    setTargetDate('');
    setMonthlyContribution('');
    setNotes('');
    setActive(true);
    setError('');
  }

  function edit(goal: GoalView) {
    setEditingId(goal.id);
    setName(goal.name);
    setTargetAmount(String(goal.targetAmount));
    setCurrentAmount(String(goal.currentAmount));
    setTargetDate(goal.targetDate);
    setMonthlyContribution(goal.monthlyContribution === null ? '' : String(goal.monthlyContribution));
    setNotes(goal.notes);
    setActive(goal.active);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = numberFromInput(targetAmount);
    const current = currentAmount.trim() ? numberFromInput(currentAmount) : 0;
    const monthly = monthlyContribution.trim() ? numberFromInput(monthlyContribution) : null;

    if (!name.trim() || !Number.isFinite(target) || target < 0 || !Number.isFinite(current) || current < 0 || (monthly !== null && (!Number.isFinite(monthly) || monthly < 0))) {
      setError('Completa el nombre y usa importes válidos iguales o superiores a 0.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/private/goal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: editingId || undefined,
          name: name.trim(),
          targetAmount: target,
          currentAmount: current,
          targetDate: targetDate || null,
          monthlyContribution: monthly,
          active,
          notes,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok || !body.goal) throw new Error('save-failed');
      const saved = body.goal;
      const next: GoalView = {
        id: saved.id,
        name: saved.name,
        targetAmount: Number(saved.target_amount) || 0,
        currentAmount: Number(saved.current_amount) || 0,
        targetDate: saved.target_date || '',
        monthlyContribution: saved.monthly_contribution == null ? null : Number(saved.monthly_contribution),
        active: saved.active !== false,
        notes: saved.notes || '',
      };
      setGoals((currentGoals) => editingId ? currentGoals.map((goal) => goal.id === editingId ? next : goal) : [...currentGoals, next]);
      resetForm();
    } catch {
      setError('No se ha podido guardar el objetivo.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(goal: GoalView) {
    if (!window.confirm(`¿Eliminar el objetivo “${goal.name}”? El cambio quedará registrado en el historial interno.`)) return;
    setError('');
    try {
      const response = await fetch(`/api/private/goal?id=${encodeURIComponent(goal.id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('delete-failed');
      setGoals((current) => current.filter((item) => item.id !== goal.id));
      if (editingId === goal.id) resetForm();
    } catch {
      setError('No se ha podido eliminar el objetivo.');
    }
  }

  return (
    <>
      <section className="grid grid-4">
        <article className="card">
          <div className="metric-label">Objetivos activos</div>
          <div className="metric-value">{goals.filter((goal) => goal.active).length}</div>
          <p className="metric-note">{totals.atRisk > 0 ? `${totals.atRisk} requieren ajuste` : 'Sin alertas de ritmo'}</p>
        </article>
        <article className="card">
          <div className="metric-label">Meta total</div>
          <div className="metric-value">{euro.format(totals.target)}</div>
          <p className="metric-note">Suma de objetivos activos</p>
        </article>
        <article className="card">
          <div className="metric-label">Progreso acumulado</div>
          <div className="metric-value">{euro.format(totals.current)}</div>
          <p className="metric-note">{totals.target > 0 ? `${Math.min(100, Math.round((totals.current / totals.target) * 100))}% del total` : 'Sin meta económica todavía'}</p>
        </article>
        <article className="card">
          <div className="metric-label">Necesario al mes</div>
          <div className="metric-value">{asOfDate ? euro.format(totals.requiredMonthly) : '—'}</div>
          <p className="metric-note">Para metas activas con fecha · base {asOfDate || 'no disponible'}</p>
        </article>
      </section>

      {fundingCapacity && fundingCapacity.status !== 'no_due_goals' && (
        <section className={`goal-capacity section-gap${fundingCapacity.status === 'shortfall' ? ' goal-capacity-risk' : fundingCapacity.status === 'tight' ? ' goal-capacity-tight' : ''}`}>
          <div><span>Cash flow medio previsto · 6 meses</span><strong>{euro.format(fundingCapacity.projectedMonthlyNet)}/mes</strong></div>
          <div><span>Necesidad mensual de objetivos</span><strong>{euro.format(fundingCapacity.requiredMonthly)}/mes</strong></div>
          <div><span>Margen después de objetivos</span><strong className={fundingCapacity.monthlyMargin < 0 ? 'amount-negative' : 'amount-positive'}>{euro.format(fundingCapacity.monthlyMargin)}/mes</strong></div>
          <div><span>Cobertura</span><strong>{fundingCapacity.coveragePct == null ? '—' : `${Math.round(fundingCapacity.coveragePct)}%`}</strong></div>
        </section>
      )}

      <section className="grid goal-layout section-gap">
        <form className="card goal-form" onSubmit={save}>
          <div className="eyebrow">{editingId ? 'Editar objetivo' : 'Nuevo objetivo'}</div>
          <h2 className="section-title">{editingId ? 'Actualiza tu meta' : 'Define una meta financiera'}</h2>
          <div className="form-stack">
            <label className="form-field"><span>Nombre</span><input className="control" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Fondo de emergencia" /></label>
            <div className="form-grid">
              <label className="form-field"><span>Objetivo (€)</span><input className="control" inputMode="decimal" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} placeholder="0,00" /></label>
              <label className="form-field"><span>Ahorrado (€)</span><input className="control" inputMode="decimal" value={currentAmount} onChange={(event) => setCurrentAmount(event.target.value)} placeholder="0,00" /></label>
            </div>
            <div className="form-grid">
              <label className="form-field"><span>Fecha objetivo</span><input className="control" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
              <label className="form-field"><span>Aportación mensual (€)</span><input className="control" inputMode="decimal" value={monthlyContribution} onChange={(event) => setMonthlyContribution(event.target.value)} placeholder="Opcional" /></label>
            </div>
            <label className="form-field"><span>Notas</span><textarea className="control textarea" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            <label className="check-row"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>Objetivo activo</span></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="editor-actions-right">
              {editingId && <button type="button" className="secondary-button" onClick={resetForm} disabled={saving}>Cancelar</button>}
              <button type="submit" className="primary-inline-button" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear objetivo'}</button>
            </div>
          </div>
        </form>

        <section className="card">
          <div className="card-heading-row">
            <div><div className="eyebrow">Seguimiento inteligente</div><h2 className="section-title">Tus objetivos</h2></div>
            <span className="badge">{goals.length}</span>
          </div>
          {goals.length === 0 ? (
            <div className="empty compact-empty">Todavía no has creado ningún objetivo.</div>
          ) : (
            <div className="goal-list">
              {goals.map((goal) => {
                const projection = projectionFor(goal, asOfDate);
                const remaining = projection?.remaining ?? Math.max(0, goal.targetAmount - goal.currentAmount);
                const progress = projection?.progressPct ?? (goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0);
                return (
                  <article className={`goal-item${goal.active ? '' : ' goal-inactive'}`} key={goal.id}>
                    <div className="goal-item-head">
                      <div>
                        <div className="row-title">{goal.name}</div>
                        <div className="row-meta">{goal.targetDate ? `Objetivo ${goal.targetDate}` : 'Sin fecha límite'}{goal.monthlyContribution !== null ? ` · ${euro.format(goal.monthlyContribution)}/mes` : ''}</div>
                      </div>
                      <span className={projectionClass(projection, goal.active)}>{projectionLabel(projection, goal.active)}</span>
                    </div>
                    <div className="progress goal-progress"><span style={{ width: `${progress}%` }} /></div>
                    <div className="goal-numbers">
                      <div><span>Actual</span><strong>{euro.format(goal.currentAmount)}</strong></div>
                      <div><span>Meta</span><strong>{euro.format(goal.targetAmount)}</strong></div>
                      <div><span>Falta</span><strong>{euro.format(remaining)}</strong></div>
                    </div>
                    {goal.active && projection && projection.status !== 'completed' && (
                      <div className={`goal-projection${projection.status === 'at_risk' ? ' goal-projection-risk' : ''}`}>
                        <div><span>Ritmo necesario</span><strong>{projection.requiredMonthlyContribution == null ? 'Sin fecha objetivo' : `${euro.format(projection.requiredMonthlyContribution)}/mes`}</strong></div>
                        <div><span>Déficit mensual</span><strong>{projection.monthlyGap == null ? '—' : euro.format(projection.monthlyGap)}</strong></div>
                        <div><span>Fecha estimada</span><strong>{projection.projectedCompletionDate || 'Sin aportación definida'}</strong></div>
                      </div>
                    )}
                    {goal.notes && <p className="goal-notes">{goal.notes}</p>}
                    <div className="goal-actions"><button type="button" className="small-button" onClick={() => edit(goal)}>Editar</button><button type="button" className="danger-ghost-button small-danger" onClick={() => remove(goal)}>Eliminar</button></div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </>
  );
}
