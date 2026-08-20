import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBudgetEnvelopes, summarizeBudget } from '../src/domain/budget-engine';
import { findDuplicateCandidates, getLatestAccountBalances, getMonthlySummary } from '../src/domain/finance-engine';
import { parseEuro, normalizeSpanishDate, validateSourceHeader, SOURCE_COLUMNS, type BankingSourceRow } from '../src/domain/source-schema';

function row(overrides: Partial<BankingSourceRow> = {}): BankingSourceRow {
  return {
    sourceId: 'id-1',
    date: '2026-08-01',
    time: '',
    productOrAccount: 'Cuenta principal',
    institution: 'Banco',
    identifier: 'account-1',
    productType: 'Cuenta',
    movementType: 'Gasto',
    category: 'Alimentación',
    subcategory: '',
    originalConcept: 'Compra',
    normalizedConcept: 'Compra',
    merchantOrCounterparty: 'Comercio',
    amount: -10,
    balance: 1000,
    channel: 'Tarjeta',
    originAccount: '',
    destinationAccount: '',
    reconciled: 'Sí',
    review: 'No',
    notes: '',
    source: 'test',
    ...overrides,
  };
}

test('el parser conserva números nativos y entiende formato EUR español', () => {
  assert.equal(parseEuro(1234.56), 1234.56);
  assert.equal(parseEuro('1.234,56 €'), 1234.56);
  assert.equal(parseEuro('-19,90'), -19.9);
  assert.equal(parseEuro(''), null);
});

test('la fecha española se normaliza a ISO sin alterar una ISO ya válida', () => {
  assert.equal(normalizeSpanishDate('2/8/2026'), '2026-08-02');
  assert.equal(normalizeSpanishDate('2026-08-02'), '2026-08-02');
});

test('el contrato de fuente exige exactamente las 22 cabeceras esperadas en orden', () => {
  assert.equal(validateSourceHeader([...SOURCE_COLUMNS]), true);
  const invalid = [...SOURCE_COLUMNS];
  invalid[13] = 'Importe';
  assert.equal(validateSourceHeader(invalid), false);
});

test('los traspasos internos no inflan ingresos, gastos ni cash flow', () => {
  const rows = [
    row({ sourceId: 'expense', amount: -40, movementType: 'Gasto' }),
    row({ sourceId: 'income', amount: 100, movementType: 'Ingreso' }),
    row({ sourceId: 'transfer-out', amount: -500, movementType: 'Traspaso interno' }),
    row({ sourceId: 'transfer-in', amount: 500, movementType: 'Traspaso interno' }),
  ];
  const summary = getMonthlySummary(rows, '2026-08');
  assert.equal(summary.income, 100);
  assert.equal(summary.expenses, 40);
  assert.equal(summary.netCashFlow, 60);
});

test('el último saldo por cuenta se obtiene por fecha y no suma saldos históricos', () => {
  const balances = getLatestAccountBalances([
    row({ sourceId: 'a-old', date: '2026-07-01', balance: 500 }),
    row({ sourceId: 'a-new', date: '2026-08-01', balance: 650 }),
    row({ sourceId: 'b', identifier: 'account-2', productOrAccount: 'Ahorro', date: '2026-08-01', balance: 900 }),
  ]);
  assert.equal(balances.length, 2);
  assert.equal(balances.find((item) => item.identifier === 'account-1')?.balance, 650);
});

test('los candidatos a duplicado requieren coincidencia de fecha, cuenta, importe y concepto', () => {
  const duplicates = findDuplicateCandidates([
    row({ sourceId: '1' }),
    row({ sourceId: '2' }),
    row({ sourceId: '3', amount: -11 }),
  ]);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].rows.length, 2);
});

test('los sobres calculan asignado, remanente, gasto y sobregasto sin tocar la fuente', () => {
  const rows = [row({ sourceId: 'current', date: '2026-08-10', category: 'Alimentación', amount: -80 })];
  const envelopes = buildBudgetEnvelopes(
    rows,
    '2026-08',
    [{ year_month: '2026-08', category: 'Alimentación', assigned: 50, rollover: true }],
    [{ year_month: '2026-07', category: 'Alimentación', assigned: 40, rollover: true }],
  );
  const envelope = envelopes.find((item) => item.category === 'Alimentación');
  assert.ok(envelope);
  assert.equal(envelope.assigned, 50);
  assert.equal(envelope.carryIn, 40);
  assert.equal(envelope.spent, 80);
  assert.equal(envelope.available, 10);
  const summary = summarizeBudget(envelopes);
  assert.equal(summary.overspent, 0);
});
