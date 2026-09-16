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
  };
}
