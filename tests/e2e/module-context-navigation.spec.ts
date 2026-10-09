import { expect, test } from "@playwright/test";
import {
  analysisModuleLinks,
  comparisonModuleLinks,
  forecastModuleLinks,
} from "../../src/application/navigation/module-context";
import { resolveForecastSelection } from "../../src/application/forecast/forecast-loader";
import { forecastSelectionFromSearchParams } from "../../src/application/forecast/forecast-query-state";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

test("Analysis conecta módulos sin perder el periodo, la cuenta ni el horizonte previsto cuando son compatibles", () => {
  const links = analysisModuleLinks(
    {
      month: "2026-09",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-17",
      accountId: ACCOUNT_ID,
    },
    {
      dateFrom: "2026-09-18",
      dateTo: "2026-10-31",
      accountId: ACCOUNT_ID,
    },
  );

  const transactions = links.find((item) => item.label === "Movimientos");
  const budgets = links.find((item) => item.label === "Presupuestos");
  const forecast = links.find((item) => item.label === "Previsión");

  expect(transactions?.href).toBe(
    `/transactions?dateFrom=2026-09-01&dateTo=2026-09-17&accountId=${ACCOUNT_ID}`,
  );
  expect(budgets?.href).toBe("/budgets?month=2026-09");
  expect(forecast?.href).toBe(
    `/forecast?dateFrom=2026-09-18&dateTo=2026-10-31&accountId=${ACCOUNT_ID}`,
  );
});

test("Forecast hereda parámetros explícitos y los valida antes de consultar el gateway", () => {
  const input = forecastSelectionFromSearchParams({
    dateFrom: ["2026-09-18", "2025-01-01"],
    dateTo: "2026-10-31",
    accountId: ACCOUNT_ID,
  });

  expect(resolveForecastSelection(input)).toEqual({
    dateFrom: "2026-09-18",
    dateTo: "2026-10-31",
    accountId: ACCOUNT_ID,
  });
  expect(() => resolveForecastSelection({
    dateFrom: "2026-10-31",
    dateTo: "2026-09-18",
  })).toThrow("invalid_forecast_date_range");
  expect(() => resolveForecastSelection({ dateFrom: "", dateTo: "2026-10-31" })).toThrow("invalid_forecast_date_from");
});

test("Forecast vuelve a módulos propietarios sin inventar un periodo analítico futuro", () => {
  const links = forecastModuleLinks({
    dateFrom: "2026-09-18",
    dateTo: "2026-10-31",
    accountId: ACCOUNT_ID,
  });

  expect(links.find((item) => item.label === "Análisis")?.href).toBe(`/analysis?accountId=${ACCOUNT_ID}`);
  expect(links.find((item) => item.label === "Movimientos")?.href).toBe(`/transactions?accountId=${ACCOUNT_ID}`);
  expect(links.find((item) => item.label === "Presupuestos")?.href).toBe("/budgets?month=2026-09");
  expect(links.find((item) => item.label === "Recurrentes")?.href).toBe(
    `/recurrences?source=forecast&forecastDateFrom=2026-09-18&forecastDateTo=2026-10-31&forecastAccountId=${ACCOUNT_ID}`,
  );
});


test("AUD-E2E-NAV-001 · Comparador devuelve a Análisis sus dos periodos y cuenta", () => {
  const links = comparisonModuleLinks({
    primaryFrom: "2026-09-01",
    primaryTo: "2026-09-30",
    referenceFrom: "2026-08-01",
    referenceTo: "2026-08-31",
    accountId: ACCOUNT_ID,
  });
  const analysis = links.find((item) => item.label === "Análisis");
  expect(analysis?.href).toBe(
    `/analysis?periodMode=custom&dateFrom=2026-09-01&dateTo=2026-09-30&compareMode=custom&compareDateFrom=2026-08-01&compareDateTo=2026-08-31&accountId=${ACCOUNT_ID}`,
  );
  expect(analysis?.detail).toMatch(/ambos periodos/);
});

test("AUD-E2E-NAV-001 · los rangos multimes usan el mes final al saltar a Cash Flow", () => {
  const analysis = analysisModuleLinks({
    month: "2026-09",
    dateFrom: "2026-07-01",
    dateTo: "2026-09-30",
    previousDateFrom: "2026-04-01",
    previousDateTo: "2026-06-30",
    accountId: ACCOUNT_ID,
  }, null);
  const cashFlow = analysis.find((item) => item.label === "Cash Flow");
  expect(cashFlow?.href).toBe("/cash-flow?month=2026-09");
  expect(cashFlow?.detail).toContain("no todo el rango");

  const comparison = comparisonModuleLinks({
    primaryFrom: "2026-07-01",
    primaryTo: "2026-09-30",
    referenceFrom: "2026-04-01",
    referenceTo: "2026-06-30",
    accountId: ACCOUNT_ID,
  });
  expect(comparison.find((item) => item.label === "Cash Flow")).toMatchObject({
    href: "/cash-flow?month=2026-09",
    detail: expect.stringContaining("Solo el mes final"),
  });
});
