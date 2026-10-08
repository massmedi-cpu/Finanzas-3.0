import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

const pkg = JSON.parse(read("package.json"));
const migration = read("supabase/migrations/20261006160500_qa08_home_balance_series_10_0_89.sql");
const financialApi = read("app/api/financial/route.ts");
const financialGateway = read("supabase/functions/financial-app-db-gateway/financial-logic.ts");
const homeEvolution = read("app/home-evolution.tsx");
const home = read("app/inicio-overview.tsx");
const documents = read("app/documents/documents-client.tsx");
const search = read("app/global-search.tsx");
const preferences = read("app/configuration/preferences/preferences-client.tsx");
const forecast = read("app/forecast/forecast-horizon-panel.tsx");
const transactions = read("app/transactions/transactions-client.tsx");
const analysisPage = read("app/analysis/page.tsx");
const homeTests = read("tests/e2e/inicio-smart-brief.spec.ts");
const documentTests = read("tests/e2e/documents.spec.ts");
const p3Tests = read("tests/e2e/user-audit-p3-10.0.89.spec.ts");
const searchTests = read("tests/e2e/global-search.spec.ts");

const versionParts = pkg.version.split(".").map(Number);
const versionAtLeast10089 =
  versionParts.length === 3 &&
  versionParts.every(Number.isInteger) &&
  (versionParts[0] > 10 ||
    (versionParts[0] === 10 && (versionParts[1] > 0 || (versionParts[1] === 0 && versionParts[2] >= 89))));
checks.push([versionAtLeast10089, "versión canónica 10.0.89 o superior"]);
checks.push([
  String(pkg.scripts?.postbuild ?? "").includes("verify-user-audit-p3-10.0.89.mjs"),
  "gate P3 incluido en postbuild",
]);

for (const token of [
  "financial_app.financial_balance_series",
  "financial_app.financial_account_balances",
  "'bankSource', 'read_only'",
  "'cashFlowReconstruction', false",
  "grant execute on function financial_app.financial_balance_series",
]) requireText(migration, token, "QA-08 motor");
checks.push([
  !/update\s+financial_app\.transaction_source_records/i.test(migration),
  "QA-08 no modifica fuente bancaria",
]);

requireText(financialApi, '"balance_series"', "QA-08 API");
requireText(financialApi, '"financial.balance_series"', "QA-08 API");
requireText(financialGateway, 'action === "financial.balance_series"', "QA-08 gateway");
requireText(financialGateway, "financial_app.financial_balance_series", "QA-08 gateway");

for (const token of [
  'aria-label="Vista de evolución financiera"',
  ">Saldo<",
  ">Ingresos y gastos<",
  ">Flujo neto<",
  "No se reconstruye desde Cash Flow",
]) requireText(homeEvolution, token, "QA-08 Inicio");
requireText(home, "<HomeEvolution", "QA-08 integración");

for (const token of [
  "hasActiveListFilters",
  "No hay coincidencias",
  "Limpiar filtros",
  'data-testid="documents-filtered-empty"',
  'data-testid="documents-repository-empty"',
]) requireText(documents, token, "QA-09 Documentos");

requireText(search, 'aria-label="Buscar en Financial App"', "QA-10 buscador");
requireText(preferences, 'aria-label="Página inicial al abrir"', "QA-10 Preferencias");

checks.push([!preferences.includes("Configuración · Fase 8"), "QA-07 sin Fase 8 en Preferencias"]);
checks.push([!forecast.includes("CASH FLOW · FASE 7"), "QA-07 sin Fase 7 en Previsión"]);
checks.push([!transactions.includes("guarda como override separado"), "QA-07 sin jerga override en cabecera"]);

const analysisClientPage = read("app/analysis/analysis-page-client.tsx");
const clientIndex = analysisClientPage.indexOf("<AnalysisClient ");
const advancedIndex = analysisClientPage.indexOf("<AnalysisAxioma53Controls");
checks.push([analysisPage.includes("<AnalysisPageClient") && clientIndex >= 0 && advancedIndex > clientIndex, "QA-07 lectura principal antes de filtros avanzados"]);

requireText(homeTests, "QA-08 · Inicio ofrece Saldo, Ingresos y gastos y Flujo neto", "regresión QA-08");
requireText(documentTests, "QA-09 · Documentos distingue filtros sin coincidencias", "regresión QA-09");
requireText(p3Tests, "QA-10 · Preferencias expone nombre accesible", "regresión QA-10");
requireText(p3Tests, "QA-07 · Análisis muestra primero la lectura principal", "regresión QA-07");
requireText(searchTests, 'getByRole("combobox", { name: "Buscar en Financial App" })', "regresión buscador accesible");

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ QA-USUARIO P3 · QA-07/QA-08/QA-09/QA-10 certificados estáticamente");
