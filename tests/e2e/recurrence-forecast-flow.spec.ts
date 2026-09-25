import { expect, test } from "@playwright/test";
import {
  forecastHrefForContext,
  forecastImpactHref,
  forecastRecurrenceHandoffFromSearchParams,
  recurrenceContextFromSearchParams,
  recurrenceIdFromResponse,
  recurrencesHrefForForecast,
} from "../../src/application/forecast/recurrence-flow";

const FORECAST_ACCOUNT_ID = "10000000-0000-4000-8000-000000000041";
const RECURRENCE_ACCOUNT_ID = "10000000-0000-4000-8000-000000000042";
const RECURRENCE_ID = "71abcdef-abcd-4abc-8abc-abcdefabcdef";

const selection = {
  dateFrom: "2026-09-18",
  dateTo: "2026-10-31",
  accountId: FORECAST_ACCOUNT_ID,
};

test("Previsión y Recurrentes comparten un contexto validado y reversible", () => {
  const recurrencesHref = recurrencesHrefForForecast(selection);
  expect(recurrencesHref).toBe(
    `/recurrences?source=forecast&forecastDateFrom=2026-09-18&forecastDateTo=2026-10-31&forecastAccountId=${FORECAST_ACCOUNT_ID}`,
  );

  const parsed = new URL(recurrencesHref, "https://financial-app.local");
  const context = recurrenceContextFromSearchParams(Object.fromEntries(parsed.searchParams));
  expect(context).toEqual(selection);
  expect(context && forecastHrefForContext(context)).toBe(
    `/forecast?dateFrom=2026-09-18&dateTo=2026-10-31&accountId=${FORECAST_ACCOUNT_ID}`,
  );
});

test("la vuelta usa el id canónico, abre la cuenta real y amplía solo un horizonte válido", () => {
  const href = forecastImpactHref(
    selection,
    { accountId: RECURRENCE_ACCOUNT_ID, nextEstimatedDate: "2026-11-15" },
    RECURRENCE_ID.toUpperCase(),
  );

  expect(href).toBe(
    `/forecast?dateFrom=2026-09-18&dateTo=2026-11-15&accountId=${RECURRENCE_ACCOUNT_ID}&recurrenceId=${RECURRENCE_ID}&recurrenceAction=refresh`,
  );

  const tooFar = new URL(forecastImpactHref(
    selection,
    { accountId: RECURRENCE_ACCOUNT_ID, nextEstimatedDate: "2029-11-15" },
    RECURRENCE_ID,
  ), "https://financial-app.local");
  expect(tooFar.searchParams.get("dateTo")).toBe(selection.dateTo);
});

test("los parámetros manipulados no activan regeneraciones ni contextos implícitos", () => {
  expect(recurrenceContextFromSearchParams({
    source: "other",
    forecastDateFrom: selection.dateFrom,
    forecastDateTo: selection.dateTo,
  })).toBeNull();
  expect(recurrenceContextFromSearchParams({
    source: "forecast",
    forecastDateFrom: "2026-02-30",
    forecastDateTo: selection.dateTo,
  })).toBeNull();
  expect(recurrenceContextFromSearchParams({
    source: "forecast",
    forecastDateFrom: "2026-01-01",
    forecastDateTo: "2029-01-01",
  })).toBeNull();

  expect(forecastRecurrenceHandoffFromSearchParams({
    recurrenceId: "not-a-uuid",
    recurrenceAction: "refresh",
  }, selection)).toBeNull();
  expect(forecastRecurrenceHandoffFromSearchParams({
    recurrenceId: RECURRENCE_ID,
    recurrenceAction: "true",
  }, selection)).toEqual({ ...selection, recurrenceId: RECURRENCE_ID, refresh: false });
});

test("solo se acepta como identidad la recurrencia canónica devuelta por persistencia", () => {
  expect(recurrenceIdFromResponse({ id: RECURRENCE_ID.toUpperCase() })).toBe(RECURRENCE_ID);
  expect(recurrenceIdFromResponse({ id: "not-a-uuid" })).toBeNull();
  expect(recurrenceIdFromResponse([RECURRENCE_ID])).toBeNull();
});
