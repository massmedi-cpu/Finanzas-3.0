export type ClassificationOrigin = 'source' | 'rule' | 'manual' | 'split';

export interface ClassificationOriginInput {
  sourceCategory: string;
  category: string;
  sourceSubcategory: string;
  subcategory: string;
  sourceMerchant: string;
  merchant: string;
  hasOverride: boolean;
  ruleApplied: boolean;
  appliedRuleName?: string | null;
  splitCount: number;
}

export interface ClassificationOriginResult {
  origin: ClassificationOrigin;
  label: string;
  detail: string;
}

export function resolveClassificationOrigin(input: ClassificationOriginInput): ClassificationOriginResult {
  if (input.splitCount >= 2) {
    return { origin: 'split', label: 'División manual', detail: 'La categoría efectiva procede de las partes en las que dividiste el movimiento.' };
  }

  const manualClassification = input.hasOverride && (
    input.category !== input.sourceCategory
    || input.subcategory !== input.sourceSubcategory
    || input.merchant !== input.sourceMerchant
  );
  if (manualClassification) {
    return { origin: 'manual', label: 'Ajuste manual', detail: 'Tu edición privada tiene prioridad sobre reglas y datos de origen.' };
  }

  if (input.ruleApplied) {
    const suffix = input.appliedRuleName ? `: ${input.appliedRuleName}` : '';
    return { origin: 'rule', label: 'Regla automática', detail: `La clasificación procede de una regla privada activa${suffix}.` };
  }

  return { origin: 'source', label: 'Fuente bancaria', detail: 'No hay una clasificación privada que sustituya estos campos.' };
}
