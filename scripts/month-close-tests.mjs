import assert from 'node:assert/strict';
import { assessMonthClose } from '../src/domain/month-close-engine.ts';

const clean = assessMonthClose({
  yearMonth: '2026-07',
  today: '2026-08-21',
  summary: { movementCount: 42, pendingReview: 0, unreconciled: 0, uncategorized: 0, transferCount: 3, income: 2200, expenses: 1700, netCashFlow: 500 },
  duplicateGroups: 0,
  budgets: [{ assigned: 1000, spent: 900 }, { assigned: 800, spent: 700 }],
});
assert.equal(clean.ready, true);
assert.equal(clean.blockers.length, 0);
assert.equal(clean.overspentCategories, 0);
assert.ok(clean.score >= 90);

const currentMonth = assessMonthClose({
  yearMonth: '2026-08',
  today: '2026-08-21',
  summary: { movementCount: 10, pendingReview: 0, unreconciled: 0, uncategorized: 0, transferCount: 0, income: 1000, expenses: 500, netCashFlow: 500 },
  duplicateGroups: 0,
  budgets: [{ assigned: 500, spent: 500 }],
});
assert.equal(currentMonth.ready, false);
assert.equal(currentMonth.blockers.some((issue) => issue.id === 'month-open'), true, 'No se puede cerrar un mes que todavía no ha terminado');

const unresolved = assessMonthClose({
  yearMonth: '2026-07',
  today: '2026-08-21',
  summary: { movementCount: 50, pendingReview: 2, unreconciled: 4, uncategorized: 1, transferCount: 2, income: 2000, expenses: 2100, netCashFlow: -100 },
  duplicateGroups: 3,
  budgets: [{ assigned: 500, spent: 700 }],
});
assert.equal(unresolved.ready, false);
for (const id of ['pending-review', 'unreconciled', 'uncategorized', 'duplicates']) {
  assert.equal(unresolved.blockers.some((issue) => issue.id === id), true, `Debe bloquear por ${id}`);
}
assert.equal(unresolved.warnings.some((issue) => issue.id === 'budget-overrun'), true);
assert.equal(unresolved.warnings.some((issue) => issue.id === 'negative-cash-flow'), true);

const noBudget = assessMonthClose({
  yearMonth: '2026-06',
  today: '2026-08-21',
  summary: { movementCount: 1, pendingReview: 0, unreconciled: 0, uncategorized: 0, transferCount: 0, income: 100, expenses: 50, netCashFlow: 50 },
  duplicateGroups: 0,
  budgets: [],
});
assert.equal(noBudget.ready, true, 'La ausencia de presupuesto es advertencia, no bloqueo del cierre');
assert.equal(noBudget.warnings.some((issue) => issue.id === 'no-budget'), true);

console.log('Month-close regression tests: OK');
