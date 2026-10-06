import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const calendar = read("src/application/analysis/analysis-calendar-series.ts");
const accumulated = read("app/analysis/analysis-axioma53-summary.tsx");
const insights = read("app/analysis/analysis-movement-insights.tsx");
const home = read("app/inicio-overview.tsx");
const engine = read("src/application/analysis/analysis-engine.ts");
const analysis = read("app/analysis/analysis-client.tsx");
const cashFlow = read("app/cash-flow/cash-flow-evolution.tsx");
const analysisTests = read("tests/e2e/premium-analysis-visual.spec.ts");
const homeTests = read("tests/e2e/inicio-smart-brief.spec.ts");
const historyTests = read("tests/e2e/analysis-history-integrity.spec.ts");
const cashTests = read("tests/e2e/cash-flow-accounting.spec.ts");

const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

checks.push([pkg.version === "10.0.88", "versión canónica 10.0.88"]);
checks.push([
  String(pkg.scripts?.postbuild ?? "").includes("verify-user-audit-p2-10.0.88.mjs"),
  "gate 10.0.88 incluido en postbuild",
]);

for (const token of [
  "buildDailySpendCalendar",
  "hasActivity",
  "expenseCents: row?.expenseCents ?? 0",
  "buildAccumulatedDailySpend",
]) requireText(calendar, token, "QA-04 calendario");

for (const token of [
  "buildAccumulatedDailySpend",
  "Los días sin gasto permanecen planos",
]) requireText(accumulated, token, "QA-04 acumulado");

for (const token of [
  "buildDailySpendCalendar",
  "días sin gasto = 0 €",
  "días sin gasto representados en cero",
]) requireText(insights, token, "QA-04 ritmo");

for (const token of [
  "flatZero = maximum === 0 && minimum === 0",
  "? [0]",
  "sin fabricar céntimos",
]) requireText(cashFlow, token, "QA-04 cash-flow");

for (const token of [
  "balanceCoverageLabel",
  "Suma de saldos bancarios con fechas distintas",
  "explicitBalanceDate",
]) requireText(home, token, "QA-05 saldos");

for (const token of [
  "aggregateSavingsRateBps",
  "savingsRateTrend",
  "savingsRateBps: aggregateSavingsRateBps(sample)",
]) requireText(engine, token, "QA-06 motor");

for (const token of [
  "Tasa agregada",
  "Tasa de ahorro agregada",
  "Media mensual de",
]) requireText(analysis, token, "QA-06 narrativa");

for (const token of [
  "QA-04 · acumulado y ritmo diario respetan el calendario",
  "QA-06 · Análisis identifica la tasa histórica como agregada",
]) requireText(analysisTests, token, "regresión Análisis");
requireText(homeTests, "QA-05 · Inicio no atribuye al día de consulta", "regresión Inicio");
requireText(historyTests, "QA-06 · la tasa de ahorro usa ventanas agregadas", "regresión motor");
requireText(cashTests, "QA-04 · Cash Flow plano usa una única referencia 0 €", "regresión Cash Flow");

checks.push([
  !/update\s+financial_app\.transaction_source_records/i.test(calendar + accumulated + insights + home + engine + analysis + cashFlow),
  "QA-04/05/06 no escriben en fuente bancaria",
]);

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ QA-USUARIO P2 · QA-04/QA-05/QA-06 certificados estáticamente");
