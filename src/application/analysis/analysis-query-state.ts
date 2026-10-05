import type { AnalysisSelectionInput } from "./analysis-loader";

export type AnalysisSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function optionalValue(params: AnalysisSearchParams, key: string) {
  const value = firstValue(params[key]);
  return value === undefined ? undefined : value;
}

export function analysisSelectionFromSearchParams(params: AnalysisSearchParams): AnalysisSelectionInput {
  const periodMode = optionalValue(params, "periodMode");
  const year = optionalValue(params, "year");
  const dateFrom = optionalValue(params, "dateFrom");
  const dateTo = optionalValue(params, "dateTo");
  const compareMode = optionalValue(params, "compareMode");
  const compareDateFrom = optionalValue(params, "compareDateFrom");
  const compareDateTo = optionalValue(params, "compareDateTo");

  return {
    month: firstValue(params.month) ?? null,
    range: firstValue(params.range) ?? null,
    accountId: firstValue(params.accountId) ?? null,
    ...(periodMode !== undefined ? { periodMode } : {}),
    ...(year !== undefined ? { year } : {}),
    ...(dateFrom !== undefined ? { dateFrom } : {}),
    ...(dateTo !== undefined ? { dateTo } : {}),
    ...(compareMode !== undefined ? { compareMode } : {}),
    ...(compareDateFrom !== undefined ? { compareDateFrom } : {}),
    ...(compareDateTo !== undefined ? { compareDateTo } : {}),
  };
}
