import Link from 'next/link';
import { assessMonthClose, type MonthCloseSummaryInput } from '../../src/domain/month-close-engine';
import { getNormalizedPlan, getNormalizedReview } from '../../src/normalized/analytics-client';
import { getMonthClosure, getMonthClosureSummary } from '../../src/private-data/month-closure';
import MonthCloseManager from './MonthCloseManager';

export const dynamic = 'force-dynamic';

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function todayMadrid(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function asNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function summaryInput(summary: Awaited<ReturnType<typeof getMonthClosureSummary>>): MonthCloseSummaryInput {
  return {
    movementCount: asNumber(summary.movement_count),
    pendingReview: asNumber(summary.pending_review),
    unreconciled: asNumber(summary.unreconciled),
    uncategorized: asNumber(summary.uncategorized),
    transferCount: asNumber(summary.transfer_count),
    income: asNumber(summary.income),
    expenses: asNumber(summary.expenses),
    netCashFlow: asNumber(summary.net_cash_flow),
  };
}

function snapshotDrift(snapshot: Record<string, unknown> | undefined, current: MonthCloseSummaryInput): boolean {
  const previous = snapshot?.summary;
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return false;
  const record = previous as Record<string, unknown>;
  return ['movementCount', 'pendingReview', 'unreconciled', 'uncategorized', 'transferCount', 'income', 'expenses', 'netCashFlow']
    .some((key) => Math.abs(asNumber(record[key]) - asNumber(current[key as keyof MonthCloseSummaryInput])) > 0.005);
}

export default async function CierrePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const today = todayMadrid();
  let dataError = false;
  let plan: Awaited<ReturnType<typeof getNormalizedPlan>> | null = null;
  let selectedMonth = /^\d{4}-\d{2}$/.test(params.month || '') ? params.month as string : '';

  try {
    const bootstrap = await getNormalizedPlan(selectedMonth || undefined);
    if (!selectedMonth) {
      selectedMonth = bootstrap.core.selectedMonth || '';
      if (selectedMonth >= today.slice(0, 7) && bootstrap.core.previousMonth) selectedMonth = bootstrap.core.previousMonth;
    }
    plan = selectedMonth && selectedMonth !== bootstrap.core.selectedMonth ? await getNormalizedPlan(selectedMonth) : bootstrap;
  } catch {
    dataError = true;
  }

  if (dataError || !plan || !selectedMonth) {
    return <main className="page"><section className="page-header"><div><div className="eyebrow">Cierre mensual</div><h1>Cierra cada mes con trazabilidad</h1></div></section><div className="status-panel status-danger"><div><div className="status-title">No se puede preparar el cierre</div><div className="status-copy">La operación se detiene si no están disponibles el motor normalizado y las capas privadas necesarias.</div></div></div></main>;
  }

  let closureDataError = false;
  let rawSummary: Awaited<ReturnType<typeof getMonthClosureSummary>> | null = null;
  let closure: Awaited<ReturnType<typeof getMonthClosure>> = null;
  let review: Awaited<ReturnType<typeof getNormalizedReview>> | null = null;

  try {
    [rawSummary, closure, review] = await Promise.all([
      getMonthClosureSummary(selectedMonth),
      getMonthClosure(selectedMonth),
      getNormalizedReview(),
    ]);
  } catch {
    closureDataError = true;
  }

  if (closureDataError || !rawSummary || !review) {
    return <main className="page"><section className="page-header"><div><div className="eyebrow">Cierre mensual</div><h1>Cierra cada mes con trazabilidad</h1></div></section><div className="status-panel status-danger"><div><div className="status-title">No se puede evaluar el cierre con garantías</div><div className="status-copy">No se muestran resultados parciales si falla el resumen efectivo, la revisión o el historial de cierres.</div></div></div></main>;
  }

  const summary = summaryInput(rawSummary);
  const duplicateGroups = review.issues.filter((issue) => issue.type === 'duplicate' && issue.movements.some((movement) => movement.date.startsWith(selectedMonth))).length;
  const budgets = plan.budget.rows.map((row) => ({ assigned: asNumber(row.assigned), spent: asNumber(row.spent) }));
  const assessment = assessMonthClose({ yearMonth: selectedMonth, today, summary, duplicateGroups, budgets });
  const previous = plan.core.previous;
  const current = plan.core.current;
  const snapshot = {
    capturedAt: new Date().toISOString(),
    summary,
    duplicateGroups,
    budget: { assigned: assessment.totalAssigned, spent: assessment.totalSpentAgainstBudget, overspentCategories: assessment.overspentCategories },
    comparison: previous && current ? { previousMonth: plan.core.previousMonth, incomeDelta: current.income - previous.income, expenseDelta: current.expenses - previous.expenses, netDelta: current.netCashFlow - previous.netCashFlow } : null,
    score: assessment.score,
    blockers: assessment.blockers.map((issue) => issue.id),
    warnings: assessment.warnings.map((issue) => issue.id),
  };
  const drift = closure?.status === 'closed' && snapshotDrift(closure.snapshot, summary);

  return (
    <main className="page">
      <section className="page-header close-header">
        <div>
          <div className="eyebrow">Cierre mensual</div>
          <h1>Convierte cada mes en un periodo revisado</h1>
          <p className="subtitle">Comprueba revisión, conciliación, categorías, duplicados, presupuesto y cash flow antes de fijar una fotografía auditable. La fuente bancaria original permanece intacta.</p>
        </div>
        <form method="get" className="close-month-picker">
          <label><span>Periodo</span><input className="control" type="month" name="month" defaultValue={selectedMonth} /></label>
          <button className="small-button" type="submit">Abrir</button>
        </form>
      </section>

      {drift && <div className="status-panel status-warning"><div><div className="status-title">El periodo cerrado ha cambiado después del cierre</div><div className="status-copy">Las métricas actuales ya no coinciden con la fotografía guardada. Reabre el periodo, revisa los cambios y vuelve a cerrarlo para mantener la trazabilidad.</div></div></div>}

      <section className="grid grid-4">
        <article className="card"><div className="metric-label">Puntuación de cierre</div><div className={`metric-value ${assessment.ready ? 'amount-positive' : 'amount-negative'}`}>{assessment.score}/100</div><p className="metric-note">{assessment.ready ? 'Sin bloqueadores obligatorios' : `${assessment.blockers.length} bloqueadores pendientes`}</p></article>
        <article className="card"><div className="metric-label">Ingresos</div><div className="metric-value amount-positive">{euro.format(summary.income)}</div><p className="metric-note">Traspasos excluidos</p></article>
        <article className="card"><div className="metric-label">Gastos</div><div className="metric-value amount-negative">{euro.format(summary.expenses)}</div><p className="metric-note">{summary.movementCount} movimientos efectivos</p></article>
        <article className="card"><div className="metric-label">Cash flow</div><div className={`metric-value ${summary.netCashFlow < 0 ? 'amount-negative' : 'amount-positive'}`}>{euro.format(summary.netCashFlow)}</div><p className="metric-note">{summary.transferCount} traspasos fuera del cálculo</p></article>
      </section>

      {current && previous && <section className="card section-gap"><div className="card-heading-row"><div><div className="eyebrow">Comparativa</div><h2 className="section-title">Frente a {plan.core.previousMonth}</h2></div><Link href={`/informes?year=${selectedMonth.slice(0, 4)}`} prefetch={false} className="text-link">Ver informes</Link></div><div className="close-comparison"><div><span>Ingresos</span><strong className={current.income - previous.income >= 0 ? 'amount-positive' : 'amount-negative'}>{current.income - previous.income >= 0 ? '+' : ''}{euro.format(current.income - previous.income)}</strong></div><div><span>Gastos</span><strong className={current.expenses - previous.expenses <= 0 ? 'amount-positive' : 'amount-negative'}>{current.expenses - previous.expenses >= 0 ? '+' : ''}{euro.format(current.expenses - previous.expenses)}</strong></div><div><span>Cash flow</span><strong className={current.netCashFlow - previous.netCashFlow >= 0 ? 'amount-positive' : 'amount-negative'}>{current.netCashFlow - previous.netCashFlow >= 0 ? '+' : ''}{euro.format(current.netCashFlow - previous.netCashFlow)}</strong></div></div></section>}

      <section className="grid grid-2 section-gap">
        <article className="card"><div className="card-heading-row"><div><div className="eyebrow">Bloqueadores</div><h2 className="section-title">Antes de cerrar</h2></div><span className="badge">{assessment.blockers.length}</span></div>{assessment.blockers.length === 0 ? <div className="empty compact-empty">No hay bloqueadores. El periodo puede cerrarse.</div> : <div className="close-check-list">{assessment.blockers.map((issue) => <div className="close-check close-check-blocker" key={issue.id}><div><strong>{issue.title}</strong><p>{issue.detail}</p></div>{issue.count !== undefined && <span className="badge">{issue.count}</span>}</div>)}</div>}</article>
        <article className="card"><div className="card-heading-row"><div><div className="eyebrow">Advertencias</div><h2 className="section-title">Contexto que conviene documentar</h2></div><span className="badge">{assessment.warnings.length}</span></div>{assessment.warnings.length === 0 ? <div className="empty compact-empty">Sin advertencias relevantes para este periodo.</div> : <div className="close-check-list">{assessment.warnings.map((issue) => <div className="close-check close-check-warning" key={issue.id}><div><strong>{issue.title}</strong><p>{issue.detail}</p></div>{issue.count !== undefined && <span className="badge">{issue.count}</span>}</div>)}</div>}</article>
      </section>

      <section className="card section-gap"><div className="card-heading-row"><div><div className="eyebrow">Checklist superado</div><h2 className="section-title">Controles resueltos</h2></div><span className="badge">{assessment.checks.length}</span></div><div className="close-check-list close-check-list-ok">{assessment.checks.map((issue) => <div className="close-check close-check-ok" key={issue.id}><div><strong>{issue.title}</strong><p>{issue.detail}</p></div><span className="state state-ok">OK</span></div>)}</div></section>

      <MonthCloseManager yearMonth={selectedMonth} assessment={assessment} closure={closure} snapshot={snapshot} />
    </main>
  );
}
