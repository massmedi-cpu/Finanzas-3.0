import type { ComparisonSelectionInput } from "./comparison-selection";

export type ComparisonSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function comparisonSelectionFromSearchParams(params: ComparisonSearchParams): ComparisonSelectionInput {
  return {
    primaryFrom: first(params.primaryFrom) ?? null,
    primaryTo: first(params.primaryTo) ?? null,
    referenceFrom: first(params.referenceFrom) ?? null,
    referenceTo: first(params.referenceTo) ?? null,
    accountId: first(params.accountId) ?? null,
  };
}
