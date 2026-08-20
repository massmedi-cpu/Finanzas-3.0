import assert from 'node:assert/strict';
import {
  isTransfer,
  getMonthlySummary,
  findDuplicateCandidates,
  getLatestAccountBalances,
} from '../src/domain/finance-engine.ts';
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

assert.equal(hasUsableSessionToken('2000000000.firebase.signature', 1900000000), true);
assert.equal(hasUsableSessionToken('1800000000.firebase.signature', 1900000000), false, 'Una sesión expirada debe rechazarse antes del shell');
assert.equal(hasUsableSessionToken('malformed', 1900000000), false);

console.log('Finance domain regression tests: OK');
