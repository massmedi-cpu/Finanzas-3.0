import type { AnalysisSelectionInput } from "./analysis-loader";

export type AnalysisSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function analysisSelectionFromSearchParams(params: AnalysisSearchParams): AnalysisSelectionInput {
  return {
    month: firstValue(params.month) ?? null,
    range: firstValue(params.range) ?? null,
    accountId: firstValue(params.accountId) ?? null,
    periodMode: firstValue(params.periodMode) ?? null,
    year: firstValue(params.year) ?? null,
    dateFrom: firstValue(params.dateFrom) ?? null,
    dateTo: firstValue(params.dateTo) ?? null,
    compareMode: firstValue(params.compareMode) ?? null,
    compareDateFrom: firstValue(params.compareDateFrom) ?? null,
    compareDateTo: firstValue(params.compareDateTo) ?? null,
  };
}
