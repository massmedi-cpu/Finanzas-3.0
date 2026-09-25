import {
  resolveForecastSelection,
  type ForecastSelectionInput,
  type ResolvedForecastSelection,
} from "./forecast-selection";

export type FlowSearchParams = Record<string, string | string[] | undefined>;

export type ForecastRecurrenceContext = ResolvedForecastSelection;

export type ForecastRecurrenceHandoff = ResolvedForecastSelection & {
  recurrenceId: string;
  refresh: boolean;
};

export type RecurrenceImpactCandidate = {
  accountId: string | null;
  nextEstimatedDate: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function paramsHref(path: string, entries: Array<[string, string | null | undefined]>) {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function validSelection(input: ForecastSelectionInput) {
  try {
    return resolveForecastSelection(input);
  } catch {
    return null;
  }
}

function extendedDateTo(context: ForecastRecurrenceContext, nextEstimatedDate: string | null) {
  if (!nextEstimatedDate || nextEstimatedDate <= context.dateTo) return context.dateTo;
  const candidate = validSelection({
    dateFrom: context.dateFrom,
    dateTo: nextEstimatedDate,
    accountId: context.accountId,
  });
  return candidate ? nextEstimatedDate : context.dateTo;
}

export function recurrencesHrefForForecast(selection: ForecastSelectionInput) {
  const resolved = resolveForecastSelection(selection);
  return paramsHref("/recurrences", [
    ["source", "forecast"],
    ["forecastDateFrom", resolved.dateFrom],
    ["forecastDateTo", resolved.dateTo],
    ["forecastAccountId", resolved.accountId],
  ]);
}

export function forecastHrefForContext(context: ForecastRecurrenceContext) {
  return paramsHref("/forecast", [
    ["dateFrom", context.dateFrom],
    ["dateTo", context.dateTo],
    ["accountId", context.accountId],
  ]);
}

export function recurrenceContextFromSearchParams(
  params: FlowSearchParams,
): ForecastRecurrenceContext | null {
  if (firstValue(params.source) !== "forecast") return null;
  const dateFrom = firstValue(params.forecastDateFrom);
  const dateTo = firstValue(params.forecastDateTo);
  if (!dateFrom || !dateTo) return null;
  return validSelection({
    dateFrom,
    dateTo,
    accountId: firstValue(params.forecastAccountId) ?? null,
  });
}

export function recurrenceIdFromResponse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && UUID.test(id) ? id.toLowerCase() : null;
}

export function forecastImpactHref(
  context: ForecastRecurrenceContext,
  candidate: RecurrenceImpactCandidate,
  recurrenceId: string,
) {
  if (!UUID.test(recurrenceId)) throw new Error("invalid_recurrence_impact_id");

  const candidateScope = validSelection({
    dateFrom: context.dateFrom,
    dateTo: context.dateTo,
    accountId: candidate.accountId,
  });
  const accountId = candidate.accountId === null
    ? context.accountId
    : candidateScope?.accountId ?? context.accountId;
  const dateTo = extendedDateTo(context, candidate.nextEstimatedDate);
  const resolved = resolveForecastSelection({
    dateFrom: context.dateFrom,
    dateTo,
    accountId,
  });

  return paramsHref("/forecast", [
    ["dateFrom", resolved.dateFrom],
    ["dateTo", resolved.dateTo],
    ["accountId", resolved.accountId],
    ["recurrenceId", recurrenceId.toLowerCase()],
    ["recurrenceAction", "refresh"],
  ]);
}

export function forecastRecurrenceHandoffFromSearchParams(
  params: FlowSearchParams,
  selection: ResolvedForecastSelection,
): ForecastRecurrenceHandoff | null {
  const recurrenceId = firstValue(params.recurrenceId);
  if (!recurrenceId || !UUID.test(recurrenceId)) return null;
  return {
    ...selection,
    recurrenceId: recurrenceId.toLowerCase(),
    refresh: firstValue(params.recurrenceAction) === "refresh",
  };
}
