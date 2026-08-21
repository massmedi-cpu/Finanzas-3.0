import assert from 'node:assert/strict';
import { applyClassificationRule, classificationRuleMatches, selectBestClassificationRule } from '../src/domain/classification-rule-engine.ts';

const candidate = {
  accountKey: 'acc-main',
  concept: 'COMPRA EN AVILA BAR TARJETA',
  merchant: 'AVILA BAR',
  amount: -18.5,
  sourceCategory: 'Hostelería',
  sourceSubcategory: 'Bares y restaurantes',
  manualCategory: null,
  manualSubcategory: null,
  manualMerchant: null,
};

const merchantRule = {
  id: 'rule-merchant',
  priority: 100,
  active: true,
  matchField: 'merchant',
  matchMode: 'equals',
  matchText: 'avila bar',
  accountKey: null,
  direction: 'expense',
  targetMerchant: 'Bar Ávila',
  targetCategory: 'Hostelería',
  targetSubcategory: null,
};

assert.equal(classificationRuleMatches(merchantRule, candidate), true, 'La coincidencia debe ser case-insensitive');
assert.equal(classificationRuleMatches({ ...merchantRule, direction: 'income' }, candidate), false, 'Una regla de ingresos no puede tocar un gasto');
assert.equal(classificationRuleMatches({ ...merchantRule, accountKey: 'otra' }, candidate), false, 'La cuenta restringida debe respetarse');
assert.equal(classificationRuleMatches({ ...merchantRule, matchMode: 'starts_with', matchText: 'AVILA' }, candidate), true);
assert.equal(classificationRuleMatches({ ...merchantRule, matchField: 'concept', matchMode: 'contains', matchText: 'tarjeta' }, candidate), true);

const lower = { ...merchantRule, id: 'lower', priority: 50, targetMerchant: 'Inferior' };
const higher = { ...merchantRule, id: 'higher', priority: 200, targetMerchant: 'Superior' };
assert.equal(selectBestClassificationRule([lower, higher], candidate)?.id, 'higher', 'La prioridad más alta debe ganar');

const automatic = applyClassificationRule(merchantRule, candidate);
assert.equal(automatic.merchant, 'Bar Ávila');
assert.equal(automatic.ruleApplied, true);

const manual = applyClassificationRule(merchantRule, { ...candidate, manualMerchant: 'Nombre manual' });
assert.equal(manual.merchant, 'Nombre manual', 'El override manual debe ganar a la regla');
assert.equal(manual.category, 'Hostelería');
assert.equal(manual.ruleApplied, false, 'Si el único campo objetivo está protegido manualmente no debe figurar como aplicado');

const mixedRule = { ...merchantRule, targetCategory: 'Ocio', targetMerchant: 'Bar Ávila' };
const mixed = applyClassificationRule(mixedRule, { ...candidate, manualMerchant: 'Nombre manual' });
assert.equal(mixed.merchant, 'Nombre manual');
assert.equal(mixed.category, 'Ocio');
assert.equal(mixed.ruleApplied, true, 'La regla puede completar campos no protegidos aunque otro campo sea manual');

console.log('Classification rule regression tests: OK');
