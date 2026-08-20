import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadFinanceEngine() {
  const source = fs.readFileSync(new URL('../src/domain/finance-engine.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  const module = { exports: {} };
  const sandbox = { module, exports: module.exports };
  vm.runInNewContext(compiled, sandbox, { filename: 'finance-engine.js' });
  return module.exports;
}

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

const {
  isTransfer,
  getMonthlySummary,
  findDuplicateCandidates,
  getLatestAccountBalances,
} = loadFinanceEngine();

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

console.log('Finance domain regression tests: OK');
