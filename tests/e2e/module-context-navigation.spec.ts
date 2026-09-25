import { expect, test } from "@playwright/test";
import {
  analysisModuleLinks,
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
  const forecast = links.find((item) => item.label === "Previsión");

  expect(transactions?.href).toBe(
    `/transactions?dateFrom=2026-09-01&dateTo=2026-09-17&accountId=${ACCOUNT_ID}`,
  );
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
});

test("Forecast vuelve a módulos propietarios sin inventar un periodo analítico futuro", () => {
  const links = forecastModuleLinks({
    dateFrom: "2026-09-18",
    dateTo: "2026-10-31",
    accountId: ACCOUNT_ID,
  });

  expect(links.find((item) => item.label === "Análisis")?.href).toBe(`/analysis?accountId=${ACCOUNT_ID}`);
  expect(links.find((item) => item.label === "Movimientos")?.href).toBe(`/transactions?accountId=${ACCOUNT_ID}`);
  expect(links.find((item) => item.label === "Presupuestos")?.href).toBe("/budgets");
  expect(links.find((item) => item.label === "Recurrentes")?.href).toBe(
    `/recurrences?source=forecast&forecastDateFrom=2026-09-18&forecastDateTo=2026-10-31&forecastAccountId=${ACCOUNT_ID}`,
  );
});
