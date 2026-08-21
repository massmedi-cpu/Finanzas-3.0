import assert from 'node:assert/strict';
import {
  isTransfer,
  getMonthlySummary,
  findDuplicateCandidates,
  getLatestAccountBalances,
} from '../src/domain/finance-engine.ts';
import { buildFinancialAlerts } from '../src/domain/financial-alert-engine.ts';
import { projectGoal } from '../src/domain/goal-engine.ts';
import { assessGoalFundingCapacity, averageMonthlyForecastNet, scenarioAverageMonthlyNet } from '../src/domain/planning-capacity-engine.ts';
import { detectQualityIssues } from '../src/domain/quality-engine.ts';
import { rowsForAnalytics } from '../src/private-data/merge.ts';
import { hasUsableSessionToken } from '../src/security/session.ts';

function row(patch = {}) {
  return {
    sourceId: 'id-1',
    date: '2026-08-20',
    time: '12:00',
    productOrAccount: 'Cuenta principal',
    institution: 'Banco',
    identifier: 'acc-1',
    productType: 'Cuenta',
    movementType: 'Gasto',
    category: 'Alimentación',
    subcategory: '',
    originalConcept: 'Compra',
    normalizedConcept: 'Compra',
    merchantOrCounterparty: 'Comercio',
    amount: -20,
    balance: 1000,
    channel: 'Tarjeta',
    originAccount: '',
    destinationAccount: '',
    reconciled: 'No',
    review: 'No',
    notes: '',
    source: 'test',
    ...patch,
  };
}

function override(sourceId, patch = {}) {
  return {
    source_id: sourceId,
    category: null,
    subcategory: null,
    merchant: null,
    notes: null,
    tags: [],
    review_status: 'pending',
    reconciled: false,
    excluded_from_analytics: false,
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
    ...patch,
  };
}

assert.equal(isTransfer(row({ movementType: 'Traspaso interno' })), true, 'Traspaso interno debe excluirse del cash flow');
assert.equal(isTransfer(row({ movementType: 'Transferencia interna' })), true, 'Transferencia interna debe excluirse del cash flow');
assert.equal(isTransfer(row({ movementType: 'Transferencia bancaria', amount: -75 })), false, 'Una transferencia externa no debe desaparecer del cash flow');

const summary = getMonthlySummary([
  row({ sourceId: 'income', movementType: 'Ingreso', amount: 1000 }),
  row({ sourceId: 'expense', movementType: 'Gasto', amount: -200 }),
  row({ sourceId: 'internal', movementType: 'Traspaso interno', amount: -300 }),
  row({ sourceId: 'external', movementType: 'Transferencia bancaria', amount: -75 }),
], '2026-08');
assert.equal(summary.income, 1000);
assert.equal(summary.expenses, 275);
assert.equal(summary.netCashFlow, 725);

const duplicates = findDuplicateCandidates([
  row({ sourceId: 'dup-a' }),
  row({ sourceId: 'dup-b' }),
  row({ sourceId: 'unique', originalConcept: 'Otro', normalizedConcept: 'Otro' }),
]);
assert.equal(duplicates.length, 1);
assert.equal(duplicates[0].rows.length, 2);

const balances = getLatestAccountBalances([
  row({ sourceId: 'newest', date: '2026-08-20', balance: 900 }),
  row({ sourceId: 'same-day-older', date: '2026-08-20', balance: 850 }),
  row({ sourceId: 'previous-day', date: '2026-08-19', balance: 700 }),
]);
assert.equal(balances.length, 1);
assert.equal(balances[0].balance, 900, 'La fuente llega en orden descendente y debe conservar el primer saldo del día más reciente');

const uncategorizedSource = row({ sourceId: 'uncategorized', category: '' });
assert.equal(detectQualityIssues([uncategorizedSource]).some((issue) => issue.type === 'uncategorized'), true);
const categorizedEffective = rowsForAnalytics([uncategorizedSource], [override('uncategorized', { category: 'Tecnología' })]);
assert.equal(detectQualityIssues(categorizedEffective).some((issue) => issue.type === 'uncategorized'), false, 'Una categoría privada debe cerrar la incidencia de categoría vacía');

const duplicateSource = [
  row({ sourceId: 'duplicate-a' }),
  row({ sourceId: 'duplicate-b' }),
];
assert.equal(detectQualityIssues(duplicateSource).some((issue) => issue.type === 'duplicate'), true);
const duplicateEffective = rowsForAnalytics(duplicateSource, [override('duplicate-b', { excluded_from_analytics: true, review_status: 'reviewed' })]);
assert.equal(detectQualityIssues(duplicateEffective).some((issue) => issue.type === 'duplicate'), false, 'Una copia excluida no debe seguir generando la misma alerta de duplicado');

const completedGoal = projectGoal({ targetAmount: 1000, currentAmount: 1000, targetDate: '2026-12-31', monthlyContribution: 100, asOfDate: '2026-08-21' });
assert.equal(completedGoal.status, 'completed');
assert.equal(completedGoal.remaining, 0);

const riskyGoal = projectGoal({ targetAmount: 1200, currentAmount: 0, targetDate: '2026-12-31', monthlyContribution: 100, asOfDate: '2026-08-21' });
assert.equal(riskyGoal.status, 'at_risk');
assert.equal(riskyGoal.monthsToTarget, 5);
assert.equal(Math.round(riskyGoal.requiredMonthlyContribution ?? 0), 240);
assert.equal(Math.round(riskyGoal.monthlyGap ?? 0), 140);

const onTrackGoal = projectGoal({ targetAmount: 1000, currentAmount: 500, targetDate: '2026-12-31', monthlyContribution: 125, asOfDate: '2026-08-21' });
assert.equal(onTrackGoal.status, 'on_track');
assert.equal(onTrackGoal.projectedCompletionDate, '2026-11-21');

const undatedGoal = projectGoal({ targetAmount: 900, currentAmount: 300, monthlyContribution: 200, asOfDate: '2026-08-21' });
assert.equal(undatedGoal.status, 'on_track');
assert.equal(undatedGoal.requiredMonthlyContribution, null);
assert.equal(undatedGoal.projectedCompletionDate, '2026-10-21');

const unplannedGoal = projectGoal({ targetAmount: 900, currentAmount: 300, targetDate: '2026-12-31', monthlyContribution: null, asOfDate: '2026-08-21' });
assert.equal(unplannedGoal.status, 'at_risk');
assert.equal(Math.round(unplannedGoal.requiredMonthlyContribution ?? 0), 120);

const forecastFixture = [
  { id: 'income-future', description: 'Ingreso', category: 'Ingresos', expectedDate: '2026-09-01', amount: 1000, confidence: 1, source: 'planned' },
  { id: 'expense-future', description: 'Gasto', category: 'Vivienda', expectedDate: '2026-10-01', amount: -200, confidence: 1, source: 'planned' },
];
const projectedMonthlyNet = averageMonthlyForecastNet(forecastFixture, '2026-08-21', 2);
assert.equal(projectedMonthlyNet, 400);

const coveredCapacity = assessGoalFundingCapacity([riskyGoal, onTrackGoal], projectedMonthlyNet);
assert.equal(coveredCapacity.status, 'covered');
assert.equal(Math.round(coveredCapacity.requiredMonthly), 340);
assert.equal(Math.round(coveredCapacity.monthlyMargin), 60);

const tightCapacity = assessGoalFundingCapacity([riskyGoal, onTrackGoal], 300);
assert.equal(tightCapacity.status, 'tight');
const shortCapacity = assessGoalFundingCapacity([riskyGoal, onTrackGoal], 150);
assert.equal(shortCapacity.status, 'shortfall');

const scenarioMonthlyNet = scenarioAverageMonthlyNet(forecastFixture, '2026-08-21', {
  id: 'scenario',
  name: 'Escenario prueba',
  income_change_pct: -10,
  expense_change_pct: 10,
  monthly_net_adjustment: 50,
  monthly_savings_allocation: 25,
  starting_balance_adjustment: 0,
  horizon_months: 2,
  active: true,
});
assert.equal(scenarioMonthlyNet, 365, 'El escenario debe ajustar ingresos, gastos, ajuste mensual y ahorro reservado sin usar el saldo inicial');
assert.equal(assessGoalFundingCapacity([riskyGoal, onTrackGoal], scenarioMonthlyNet).status, 'covered');

const criticalAlerts = buildFinancialAlerts({
  asOfDate: '2026-08-21',
  knownBalance: 1000,
  liquidity: { lowestBalance: -250, lowestDate: '2026-09-04', firstNegativeDate: '2026-09-03' },
  upcoming: [],
  pendingReview: 0,
  duplicateGroups: 0,
  uncategorized: 0,
  goalRisks: [],
});
assert.equal(criticalAlerts[0]?.severity, 'critical');
assert.equal(criticalAlerts[0]?.href, '/prevision');

const predictiveAlerts = buildFinancialAlerts({
  asOfDate: '2026-08-21',
  knownBalance: 1000,
  liquidity: { lowestBalance: 700, lowestDate: '2026-09-01', firstNegativeDate: null },
  upcoming: [{ id: 'rent', description: 'Alquiler', category: 'Vivienda', expectedDate: '2026-09-01', amount: -400, confidence: 0.99, source: 'detected' }],
  pendingReview: 2,
  duplicateGroups: 1,
  uncategorized: 0,
  goalRisks: [{ id: 'goal-1', name: 'Fondo', monthlyGap: 75, targetDate: '2026-12-31', projectedCompletionDate: '2027-03-21' }],
});
assert.equal(predictiveAlerts.some((alert) => alert.id.startsWith('large-upcoming:')), true, 'Debe avisar de un cargo próximo material');
assert.equal(predictiveAlerts.some((alert) => alert.id === 'goal-risk:goal-1'), true, 'Debe avisar de un objetivo fuera de ritmo');
assert.equal(predictiveAlerts.some((alert) => alert.id === 'data-quality'), true, 'Debe conservar la calidad de datos como alerta explicable');

assert.equal(hasUsableSessionToken('2000000000.firebase.signature', 1900000000), true);
assert.equal(hasUsableSessionToken('1800000000.firebase.signature', 1900000000), false, 'Una sesión expirada debe rechazarse antes del shell');
assert.equal(hasUsableSessionToken('malformed', 1900000000), false);

console.log('Finance domain regression tests: OK');
