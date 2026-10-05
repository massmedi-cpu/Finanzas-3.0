import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

const pkg = JSON.parse(read("package.json"));
const contract = read("src/application/forecast/forecast-contract.ts");
const engine = read("src/application/forecast/forecast-horizon-engine.ts");
const panel = read("app/forecast/forecast-horizon-panel.tsx");
const page = read("app/forecast/page.tsx");

const versionParts = String(pkg.version).split(".").map(Number);
const versionNumber = (versionParts[0] ?? 0) * 1_000_000 + (versionParts[1] ?? 0) * 1_000 + (versionParts[2] ?? 0);
checks.push([versionNumber >= 10_000_075, "version 10.0.75 o posterior"]);

for (const token of [
  '"month_end"',
  '"days_30"',
  '"months_3"',
  '"months_12"',
  "forecastMonthEnd",
  "addForecastDays(from, 30)",
  "addForecastMonths(from, 3)",
  "addForecastMonths(from, 12)",
]) requireText(engine, token, "horizontes");

for (const token of [
  "item.affectsProjection",
  "item.projectionEffectCents",
  "projectedIncomeCents",
  "projectedExpenseCents",
  "projectedNetCents",
  "projectedBalanceCents",
  "confidenceWeightedCents",
  "originCounts",
]) requireText(engine, token, "cash-flow");

for (const token of [
  "confirmedItemsAffectCashFlow",
  "excludedItemsAffectCashFlow",
  "projectionEffectCents",
  "projectedBalanceAfterCents",
]) requireText(contract, token, "contrato-compartido");

for (const token of [
  "Tu dinero en cuatro horizontes",
  "Cobros",
  "Pagos",
  "Saldo proyectado",
  "Confianza",
  "forecastHorizonEndDate",
  "/api/forecast",
]) requireText(panel, token, "interfaz");

for (const token of [
  "ForecastHorizonPanel",
  "dateFrom={resolvedSelection.dateFrom}",
  "accountId={resolvedSelection.accountId}",
]) requireText(page, token, "integracion");

const forbidden = [
  [engine.includes("confirmedTransactionId"), "el motor de horizontes no debe recalcular confirmados"],
  [engine.includes("excludedReason"), "el motor de horizontes no debe recalcular exclusiones"],
];
for (const [present, label] of forbidden) checks.push([!present, label]);

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ Financial App 10.0.75+ · Fase 7 Previsión certificada");
