export type ClassificationMatchField = 'merchant' | 'concept' | 'merchant_or_concept';
export type ClassificationMatchMode = 'contains' | 'equals' | 'starts_with';
export type ClassificationDirection = 'any' | 'income' | 'expense';

export interface ClassificationRuleInput {
  id: string;
  priority: number;
  active: boolean;
  matchField: ClassificationMatchField;
  matchMode: ClassificationMatchMode;
  matchText: string;
  accountKey?: string | null;
  direction: ClassificationDirection;
  targetCategory?: string | null;
  targetSubcategory?: string | null;
  targetMerchant?: string | null;
}

export interface ClassificationCandidate {
  accountKey: string;
  concept: string;
  merchant: string;
  amount: number;
  sourceCategory: string;
  sourceSubcategory: string;
  manualCategory?: string | null;
  manualSubcategory?: string | null;
  manualMerchant?: string | null;
}

export interface ClassificationResult {
  category: string;
  subcategory: string;
  merchant: string;
  ruleId: string | null;
  ruleApplied: boolean;
}

function normalize(value: string | null | undefined): string {
  return String(value || '').trim().toLocaleLowerCase('es-ES');
}

function textMatches(value: string, needle: string, mode: ClassificationMatchMode): boolean {
  const source = normalize(value);
  const target = normalize(needle);
  if (!target) return false;
  if (mode === 'equals') return source === target;
  if (mode === 'starts_with') return source.startsWith(target);
  return source.includes(target);
}

export function classificationRuleMatches(rule: ClassificationRuleInput, candidate: ClassificationCandidate): boolean {
  if (!rule.active) return false;
  if (rule.accountKey && rule.accountKey !== candidate.accountKey) return false;
  if (rule.direction === 'income' && candidate.amount <= 0) return false;
  if (rule.direction === 'expense' && candidate.amount >= 0) return false;

  const merchant = textMatches(candidate.merchant, rule.matchText, rule.matchMode);
  const concept = textMatches(candidate.concept, rule.matchText, rule.matchMode);
  if (rule.matchField === 'merchant') return merchant;
  if (rule.matchField === 'concept') return concept;
  return merchant || concept;
}

export function selectBestClassificationRule(rules: ClassificationRuleInput[], candidate: ClassificationCandidate): ClassificationRuleInput | null {
  return [...rules]
    .filter((rule) => classificationRuleMatches(rule, candidate))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] || null;
}

export function applyClassificationRule(rule: ClassificationRuleInput | null, candidate: ClassificationCandidate): ClassificationResult {
  const category = candidate.manualCategory?.trim() || rule?.targetCategory?.trim() || candidate.sourceCategory;
  const subcategory = candidate.manualSubcategory?.trim() || rule?.targetSubcategory?.trim() || candidate.sourceSubcategory;
  const merchant = candidate.manualMerchant?.trim() || rule?.targetMerchant?.trim() || candidate.merchant;
  const ruleApplied = Boolean(rule && (
    (!candidate.manualCategory?.trim() && rule.targetCategory?.trim() && rule.targetCategory.trim() !== candidate.sourceCategory)
    || (!candidate.manualSubcategory?.trim() && rule.targetSubcategory?.trim() && rule.targetSubcategory.trim() !== candidate.sourceSubcategory)
    || (!candidate.manualMerchant?.trim() && rule.targetMerchant?.trim() && rule.targetMerchant.trim() !== candidate.merchant)
  ));
  return { category, subcategory, merchant, ruleId: rule?.id || null, ruleApplied };
}
