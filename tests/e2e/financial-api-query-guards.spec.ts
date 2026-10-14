import { expect, test } from "@playwright/test";
import { GET as movementsGET, apiError as movementsApiError } from "../../app/api/transactions/route";
import { GET as financialGET } from "../../app/api/financial/route";
import { GET as budgetsGET } from "../../app/api/budgets/route";
import { GET as recurrenceGET, POST as recurrencePOST } from "../../app/api/recurrences/route";
import { GET as rulesGET, POST as rulesPOST, apiError as ruleApiError } from "../../app/api/rules/route";
import { apiError as merchantsApiError, POST as merchantsPOST } from "../../app/api/merchants/route";
import { GET as forecastGET } from "../../app/api/forecast/route";
import { GET as searchGET, apiError as searchApiError, allGlobalSearchSourcesFailed, globalSearchNeedsSession } from "../../app/api/search/route";
import { apiError as analysisApiError } from "../../app/api/analysis/route";
import { apiError as comparisonApiError } from "../../app/api/compare/route";
import { apiError as configurationApiError, POST as configurationPOST } from "../../app/api/configuration/route";
import { PersistenceGatewayError } from "../../src/infrastructure/persistence/vercel-supabase-gateway";

const ID = "60000000-0000-4000-8000-000000000111";

async function invalidBeforeGateway(
  handler: (request: Request) => Promise<Response>,
  endpoint: string,
  cases: ReadonlyArray<[string, string]>,
) {
  for (const [query, code] of cases) {
    const response = await handler(new Request(`https://test.local/api/${endpoint}?${query}`));
    expect(response.status, `${endpoint}?${query}`).toBe(400);
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
    expect(await response.json(), `${endpoint}?${query}`).toMatchObject({ code });
  }
}

test("REC-TXN-024 · filtros ajenos y modos de Movimientos incompatibles se rechazan sin usar la fuente bancaria", async () => {
  await invalidBeforeGateway(movementsGET, "transactions", [
    ["filter=unrecognized", "invalid_transaction_query_parameters"],
    ["mode=facets&accountId=" + ID, "invalid_transaction_query_parameters"],
    ["mode=split&transactionId=" + ID + "&dayWindow=4", "invalid_transaction_query_parameters"],
    ["mode=duplicate-group&transactionId=" + ID + "&limit=100", "invalid_transaction_query_parameters"],
    ["mode=transfer-candidates&transactionId=" + ID + "&q=ignored", "invalid_transaction_query_parameters"],
    ["mode=unknown", "invalid_transaction_query_parameters"],
    ["mode=", "invalid_transaction_query_parameters"],
    ["mode=facets&mode=facets", "invalid_transaction_query_duplicate"],
  ]);
});

test("REC-TXN-025 · fechas imposibles de banco y cursor no se normalizan silenciosamente", async () => {
  await invalidBeforeGateway(movementsGET, "transactions", [
    ["dateFrom=2026-02-30", "invalid_dateFrom"],
    ["dateTo=2025-04-31", "invalid_dateTo"],
    ["cursorBankDate=2026-02-29&cursorId=" + ID, "invalid_cursorBankDate"],
    ["dateFrom=2026-13-01", "invalid_dateFrom"],
  ]);
});

test("REC-FCAST-051 · las dos modalidades de Previsiones no mezclan periodos, cuentas y candidatos", async () => {
  await invalidBeforeGateway(forecastGET, "forecast", [
    ["itemId=" + ID + "&dateFrom=2026-10-01", "invalid_forecast_query_parameters"],
    ["days=1&dateFrom=2026-10-01&dateTo=2026-10-31", "invalid_forecast_query_parameters"],
    ["dateFrom=2026-10-01&dateTo=2026-10-31&limit=4", "invalid_forecast_query_parameters"],
    ["dateFrom=2026-10-01&dateTo=2026-10-31&unexpected=1", "invalid_forecast_query_parameters"],
    ["itemId=", "invalid_forecast_item_id"],
    ["itemId=" + ID + "&days=1e1", "invalid_forecast_candidate_days"],
    ["itemId=" + ID + "&days=%20", "invalid_forecast_candidate_days"],
    ["itemId=" + ID + "&limit=", "invalid_forecast_candidate_limit"],
    ["itemId=" + ID + "&limit=21", "invalid_forecast_candidate_limit"],
    ["itemId=" + ID + "&itemId=" + ID, "invalid_forecast_duplicate_parameters"],
  ]);
});

test("REC-SEARCH-008 · la búsqueda global no ignora selectores o términos duplicados", async () => {
  await invalidBeforeGateway(searchGET, "search", [
    ["q=alquiler&q=hipoteca", "invalid_search_query_parameters"],
    ["q=alquiler&q=alquiler", "invalid_search_query_parameters"],
    ["q=alquiler&accountId=" + ID, "invalid_search_query_parameters"],
    ["q=&limit=100", "invalid_search_query_parameters"],
    ["source=unknown", "invalid_search_query_parameters"],
  ]);
});

test("REC-SEARCH-009 · all failed sources never turn into a fictitious empty search", () => {
  const rejected = (status: number, code: string) => ({
    status: "rejected" as const,
    reason: new PersistenceGatewayError("Private gateway not available", status, code),
  });
  const ok = { status: "fulfilled" as const, value: { rows: [] } };
  expect(allGlobalSearchSourcesFailed([rejected(503, "gateway_failed"), rejected(503, "gateway_failed"), rejected(503, "gateway_failed")])).toBe(true);
  expect(globalSearchNeedsSession([rejected(503, "gateway_failed"), rejected(503, "gateway_failed")])).toBe(false);
  expect(globalSearchNeedsSession([rejected(403, "workspace_access_denied"), rejected(401, "workspace_context_required")])).toBe(true);
  expect(globalSearchNeedsSession([rejected(403, "workspace_access_denied"), rejected(503, "gateway_failed")])).toBe(false);
  expect(allGlobalSearchSourcesFailed([ok, rejected(503, "gateway_failed"), rejected(503, "gateway_failed")])).toBe(false);
  expect(allGlobalSearchSourcesFailed([])).toBe(false);
});

test("REC-API-ERR-001 · errores internos de Movimientos nunca se presentan como culpa del usuario ni filtran información", async () => {
  const sensitive = "SQL failed on account=SECRET_PRIVATE_ACCOUNT";
  const response = movementsApiError(new Error(sensitive));
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body).toEqual({ error: "internal_error", code: null });
  expect(JSON.stringify(body)).not.toContain(sensitive);
  const validation = movementsApiError(new Error("invalid_transaction_ids"));
  expect(validation.status).toBe(400);
  expect(await validation.json()).toMatchObject({ code: "invalid_transaction_ids" });
});

test("REC-API-ERR-002 · Comercios rechaza JSON inválido con 400 y oculta mensajes imprevistos", async () => {
  const malformed = await merchantsPOST(new Request("https://test.local/api/merchants", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{not-json}",
  }));
  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toMatchObject({ code: "invalid_request" });
  const unsupported = await merchantsPOST(new Request("https://test.local/api/merchants", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "merchant.drop" }),
  }));
  expect(unsupported.status).toBe(400);
  expect(await unsupported.json()).toMatchObject({ code: "unsupported_operation" });
  const sensitive = "Database credential in unexpected exception";
  const failure = merchantsApiError(new Error(sensitive));
  expect(failure.status).toBe(500);
  const payload = await failure.json();
  expect(payload).toEqual({ error: "internal_error", code: null });
  expect(JSON.stringify(payload)).not.toContain(sensitive);
});

test("REC-API-ERR-003 · Análisis y Comparador no publican mensajes financieros internos", async () => {
  const secret = "unexpected SQL interpolation of bank account 987654321";
  const error = new Error(secret);
  for (const handler of [analysisApiError, comparisonApiError]) {
    const response = handler(error, performance.now());
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.code).toBeNull();
    expect(JSON.stringify(body)).not.toContain(secret);
  }
  const analysisValidation = analysisApiError(new Error("invalid_analysis_parameter"), performance.now());
  expect(analysisValidation.status).toBe(400);
  const comparisonValidation = comparisonApiError(new Error("invalid_comparison_parameter"), performance.now());
  expect(comparisonValidation.status).toBe(400);
});

test("REC-API-ERR-004 · Configuración y Búsqueda separan JSON incorrecto de fallos privados", async () => {
  const secret = "private account id and gateway host should not leak";
  const configuration = configurationApiError(new Error(secret));
  const search = searchApiError(new Error(secret));
  for (const response of [configuration, search]) {
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.code).toBeNull();
    expect(JSON.stringify(body)).not.toContain(secret);
  }
  const malformed = await configurationPOST(new Request("https://test.local/api/configuration", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{not-json}",
  }));
  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toMatchObject({ error: "invalid_request", code: "invalid_json" });
});

test("REC-FIN-041 · Finanzas no ignora parámetros de cuenta desconocidos", async () => {
  await invalidBeforeGateway(financialGET, "financial", [
    ["scope=other", "invalid_financial_parameter"],
    ["mode=balances&unknown=1", "invalid_financial_parameter"],
    ["mode=snapshot&accountId=" + ID + "&accountId=" + ID, "invalid_duplicate_financial_parameter"],
  ]);
});

test("REC-BUD-008 · Presupuestos no presenta un total global como si hubiera filtrado una cuenta", async () => {
  await invalidBeforeGateway(budgetsGET, "budgets", [
    ["month=2026-10&accountId=" + ID, "invalid_budget_query_parameters"],
    ["month=2026-10&categoryId=" + ID, "invalid_budget_query_parameters"],
    ["month=2026-10&filter=none", "invalid_budget_query_parameters"],
    ["month=2026-10&month=2026-10", "invalid_budget_month"],
    ["month=2026-13", "invalid_budget_month"],
  ]);
});

test("REC-REC-057 · Recurrentes rechaza selectores ambiguos y rangos invertidos antes del motor", async () => {
  await invalidBeforeGateway(recurrenceGET, "recurrences", [
    ["unexpected=1", "invalid_recurrence_query_parameters"],
    ["dateTo=2026-10-31&accountId=OTHER", "invalid_recurrence_query_parameters"],
    ["minOccurrences=3&minOccurrences=4", "invalid_recurrence_query_parameters"],
    ["minOccurrences=3e0", "invalid_recurrence_min_occurrences"],
    ["minOccurrences=0x3", "invalid_recurrence_min_occurrences"],
    ["minOccurrences=%203", "invalid_recurrence_min_occurrences"],
    ["dateFrom=2026-11-01&dateTo=2026-10-01", "invalid_recurrence_date_range"],
  ]);
});

test("REC-REC-058 · guardar recurrencias nunca admite un intervalo temporal invertido", async () => {
  const response = await recurrencePOST(new Request("https://test.local/api/recurrences", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      candidateKey: "a".repeat(32), status: "active",
      dateFrom: "2026-11-01", dateTo: "2026-10-01", minOccurrences: 3,
    }),
  }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "invalid_recurrence_date_range" });
});

test("REC-RULES-031 · operaciones de reglas nunca ignoran selectores de movimiento", async () => {
  const query = await rulesGET(new Request("https://test.local/api/rules?accountId=OTHER"));
  expect(query.status).toBe(400);
  expect(await query.json()).toMatchObject({ code: "invalid_rule_query_parameters" });

  for (const body of [
    { operation: "rule.apply_all", limit: 10000, transactionId: ID },
    { operation: "rule.evaluate", transactionId: ID, limit: 12 },
    { operation: "rule.apply", transactionId: ID, targetCategoryId: ID },
  ]) {
    const response = await rulesPOST(new Request("https://test.local/api/rules", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_rule_operation_fields" });
  }
});

test("REC-RULES-032 · JSON inválido da 400 y errores internos permanecen privados", async () => {
  const invalid = await rulesPOST(new Request("https://test.local/api/rules", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{not-json}",
  }));
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({ error: "invalid_request", code: "invalid_request" });
  const raw = "Unexpected SQL error with user account ABC-SENSITIVE";
  const unexpected = ruleApiError(new Error(raw));
  expect(unexpected.status).toBe(500);
  const body = await unexpected.json();
  expect(body).toEqual({ error: "internal_error", code: null });
  expect(JSON.stringify(body)).not.toContain(raw);
});
