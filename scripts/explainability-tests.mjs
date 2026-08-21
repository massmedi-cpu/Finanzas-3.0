import assert from 'node:assert/strict';
import { resolveClassificationOrigin } from '../src/domain/classification-origin.ts';

const base = {
  sourceCategory: 'Hostelería',
  category: 'Hostelería',
  sourceSubcategory: 'Bares',
  subcategory: 'Bares',
  sourceMerchant: 'AVILA BAR',
  merchant: 'AVILA BAR',
  hasOverride: false,
  ruleApplied: false,
  appliedRuleName: null,
  splitCount: 0,
};

assert.equal(resolveClassificationOrigin(base).origin, 'source');
assert.equal(resolveClassificationOrigin({ ...base, ruleApplied: true, appliedRuleName: 'Ávila normalizado', merchant: 'Bar Ávila' }).origin, 'rule');
assert.equal(resolveClassificationOrigin({ ...base, hasOverride: true, merchant: 'Mi bar' }).origin, 'manual');
assert.equal(resolveClassificationOrigin({ ...base, hasOverride: true, ruleApplied: true, merchant: 'Mi bar' }).origin, 'manual', 'El ajuste manual debe ganar a la regla');
assert.equal(resolveClassificationOrigin({ ...base, hasOverride: true, ruleApplied: true, merchant: 'Mi bar', splitCount: 2 }).origin, 'split', 'La división manda sobre la clasificación principal');
assert.equal(resolveClassificationOrigin({ ...base, hasOverride: true }).origin, 'source', 'Un override solo de revisión/notas no debe fingir una clasificación manual');

console.log('Explainability regression tests: OK');
