import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);
const forbidText = (source, token, label) => checks.push([!source.includes(token), `${label}: ${token}`]);

const pkg = JSON.parse(read("package.json"));
const overview = read("app/inicio-overview.tsx");
const dashboard = read("app/api/dashboard/route.ts");
const analysisRoute = read("app/api/dashboard/analysis/route.ts");
const adapter = read("src/application/dashboard/home-analysis.ts");
const consistency = read("src/application/dashboard/home-consistency.ts");
const smartBrief = read("app/home-smart-brief.tsx");

const versionParts = String(pkg.version).split(".").map(Number);
const versionNumber = (versionParts[0] ?? 0) * 1_000_000 + (versionParts[1] ?? 0) * 1_000 + (versionParts[2] ?? 0);
checks.push([versionNumber >= 10_000_077, "version 10.0.77 o posterior"]);

for (const token of [
  '"financial"',
  '"monthly"',
  '"budgets"',
  '"forecast"',
  '"transactions"',
  "callPersistenceGatewayBatch",
]) requireText(dashboard, token, "fuentes-canónicas-inicio");

for (const token of [
  "loadAnalysisSnapshot",
  "periodMode: \"month\"",
  "compareMode: \"previous\"",
  "buildHomeAnalysisSummary",
  "previousCompletedMonth",
]) requireText(analysisRoute, token, "análisis-canónico-inicio");

for (const token of [
  'source: "analysis"',
  "snapshot.comparison.netDeltaCents",
  "snapshot.averages.last3Months.expenseCents",
  "snapshot.current.operatingNetCents",
  "snapshot.previous.operatingNetCents",
  "snapshot.principles.bankSource",
]) requireText(adapter, token, "adaptador-inicio");

for (const token of [
  "HomeAnalysisSummary",
  'readJson<HomeAnalysisSummary>("/api/dashboard/analysis"',
  "homeAnalysis.netComparison.currentNetCents",
  "homeAnalysis.netComparison.deltaCents",
  "homeAnalysis?.expenseAverage3m",
  "Saldo total en cuentas",
  "Este mes",
  "Próximos 30 días",
  "Gasto medio mensual",
  "Últimos 12 meses",
  "PRÓXIMOS DÍAS",
  "Disponible por cuenta",
]) requireText(overview, token, "inicio-fase9");

for (const token of [
  "Inicio never computes a replacement balance",
  "balancesMatch",
  "budgetActualMatches",
  "forecastOpeningBalanceMatches",
]) requireText(consistency, token, "conciliación-inicio");

for (const token of [
  "MES",
  "PRESUPUESTO",
  "PRÓXIMOS 30 DÍAS",
  "DATOS",
]) requireText(smartBrief, token, "resumen-inteligente");

for (const token of [
  "completedMonthlyRows",
  "current.operatingNetCents - previous.operatingNetCents",
  "sample.reduce((sum, row) => sum + row.expenseCents",
]) forbidText(overview, token, "sin-recálculo-analítico-en-inicio");

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ Financial App 10.0.77 · Fase 9 Inicio certificada: resume motores canónicos y no recalcula KPIs analíticos");
