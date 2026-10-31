import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

const pkg = JSON.parse(read("package.json"));
const migration = read("supabase/migrations/20261006110500_qa01_forecast_budget_context_10_0_87.sql");
const forecastUi = read("app/forecast/forecast-client.tsx");
const freshness = read("app/analysis/analysis-source-freshness.tsx");
const home = read("app/home-smart-brief.tsx");
const compare = read("app/compare/comparison-client.tsx");
const analysisPage = read("app/analysis/analysis-page-client.tsx");
const analysis = read("app/analysis/analysis-client.tsx");
const analysisCss = read("app/analysis/analysis.module.css");
const insightsCss = read("app/analysis/analysis-movement-insights.module.css");
const homeTests = read("tests/e2e/inicio-smart-brief.spec.ts");
const compareTests = read("tests/e2e/comparison-ui.spec.ts");
const analysisTests = read("tests/e2e/premium-analysis-visual.spec.ts");

const versionParts = pkg.version.split(".").map(Number);
const versionAtLeast10087 =
  versionParts.length === 3 &&
  versionParts.every(Number.isInteger) &&
  (versionParts[0] > 10 ||
    (versionParts[0] === 10 && (versionParts[1] > 0 || (versionParts[1] === 0 && versionParts[2] >= 87))));
checks.push([versionAtLeast10087, "versión canónica 10.0.87 o superior"]);
checks.push([
  String(pkg.scripts?.postbuild ?? "").includes("verify-user-audit-p1-10.0.87.mjs"),
  "gate 10.0.87 incluido en postbuild",
]);

for (const token of [
  "budget_month_total_context",
  "budget_month_recommendation(p_month, null)",
  "budget_month_actual(p_month, null)",
  "financial_app.forecast_snapshot",
  "financial_app.budget_month_total_context(month)",
  "'openingBalanceSource','financial_account_balances_same_day'",
  "grant execute on function financial_app.budget_month_total_context(text) to financial_app_gateway",
]) requireText(migration, token, "QA-01 motor");

checks.push([
  !migration.includes("financial_app.budget_month_snapshot(month)"),
  "QA-01 Previsión no reconstruye snapshot completo por mes",
]);
checks.push([
  !/update\s+financial_app\.transaction_source_records/i.test(migration),
  "QA-01 no modifica la fuente bancaria",
]);

for (const token of [
  "La previsión no ha podido calcularse",
  "Los datos disponibles siguen intactos",
]) requireText(forecastUi, token, "QA-01 UX");

for (const token of [
  "export type SourceFreshness",
  "onChange?: (freshness: SourceFreshness | null) => void",
  "onChange?.(next)",
]) requireText(freshness, token, "QA-02 frescura");

for (const token of [
  "Mes aún sin movimientos importados",
  "No interpretamos la ausencia de movimientos como equilibrio o mejora",
  "Datos hasta",
]) requireText(home, token, "QA-02 Inicio");

for (const token of [
  "No interpretamos 0 € como mejora",
  "El periodo principal no tiene cobertura bancaria confirmada",
  "comparisonCoverageReason(coverage, referenceCoverage)",
  "periodComparisonIsReliable(coverage) && periodComparisonIsReliable(referenceCoverage)",
  'describe(primary, "Periodo principal")',
  'describe(reference, "Periodo de referencia")',
  "No podemos interpretar la variación como una mejora o empeoramiento",
  "missingStart",
  "missingEnd",
  "periodComparisonIsReliable(coverage)",
  "Comparación incompleta",
]) requireText(compare, token, "QA-02 Comparador");

// The account selected in Análisis owns its own coverage state. This guard
// deliberately checks the stronger scoped contract rather than the old
// unscoped state-setter implementation.
for (const token of [
  "onChange={onFreshnessChange}",
  "scopedFreshness?.accountId === selectedAccountId",
  "setScopedFreshness({ accountId: selectedAccountId, value })",
  "latestMovementDate={freshness?.latestMovementDate ?? null}",
]) requireText(analysisPage, token, "QA-02 Análisis wiring");

for (const token of [
  "coverageIncomplete",
  "Cobertura incompleta: no interpretamos la variación como tendencia",
  "no interpretamos el periodo posterior como mejora ni empeoramiento",
]) requireText(analysis, token, "QA-02 Análisis narrativa");

for (const token of [
  "var(--color-surface-strong)",
  "var(--color-surface)",
  "var(--color-primary)",
]) requireText(analysisCss, token, "QA-03 Lectura rápida");
for (const token of [
  "var(--color-surface-strong)",
  "var(--color-surface)",
  "fill: var(--color-text)",
  ".weekdayPeak { color: var(--color-text); }",
]) requireText(insightsCss, token, "QA-03 Patrones");

for (const token of [
  "QA-02 · Inicio no llama equilibrio a un mes sin movimientos importados",
]) requireText(homeTests, token, "regresión Inicio");
for (const token of [
  "QA-02 · no interpreta como mejora un periodo posterior al último movimiento importado",
  "REC-CMP-004 · una referencia sin cobertura nunca permite inferir mejoras aunque el periodo principal esté cubierto",
  "REC-CMP-005 · histórico que empieza a mitad del periodo no se confunde con datos que faltan al final",
  "REC-CMP-006 · incidencia de sincronización no se diagnostica falsamente como un periodo truncado",
]) requireText(compareTests, token, "regresión Comparador");
for (const token of [
  "QA-02 · Análisis no convierte un periodo sin cobertura completa en tendencia favorable",
  "QA-03 · Lectura rápida y Patrones usan superficies legibles en tema claro",
]) requireText(analysisTests, token, "regresión Análisis");

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ QA-USUARIO P1 · QA-01/QA-02/QA-03 certificados estáticamente");
