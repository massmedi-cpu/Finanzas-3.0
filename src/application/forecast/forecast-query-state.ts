import type { ForecastSelectionInput } from "./forecast-selection";

export type ForecastSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function forecastSelectionFromSearchParams(params: ForecastSearchParams): ForecastSelectionInput {
  return {
    dateFrom: firstValue(params.dateFrom) ?? null,
    dateTo: firstValue(params.dateTo) ?? null,
    accountId: firstValue(params.accountId) ?? null,
  };
}
