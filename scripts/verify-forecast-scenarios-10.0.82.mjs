import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

const engine = read("src/application/forecast/forecast-scenarios.ts");
const component = read("app/forecast/forecast-scenarios.tsx");
const client = read("app/forecast/forecast-client.tsx");
const regression = read("tests/e2e/forecast-scenarios-10.0.82.spec.ts");
const workflow = read(".github/workflows/forecast-period-integrity-certification.yml");

for (const token of [
  '"expected"',
  '"conservative"',
  '"optimistic"',
  "DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS",
  "projectedIncomeCents",
  "projectedExpenseCents",
  "openingBalanceCents",
  "incomeCents - expenseCents",
]) requireText(engine, token, "motor-escenarios");

for (const token of [
  "Esperado",
  "Conservador",
  "Optimista",
  "Hipótesis editables",
  "FORECAST_SCENARIO_STORAGE_KEY",
  "no crean movimientos",
  "no modifican",
  "fuente bancaria",
  "Simulación local y reversible",
]) requireText(component, token, "interfaz-escenarios");

for (const token of [
  'import { ForecastScenarios } from "./forecast-scenarios"',
  "<ForecastScenarios snapshot={snapshot} />",
]) requireText(client, token, "integracion-prevision");

for (const token of [
  "Axioma §42 calcula escenarios sin alterar la base canónica",
  "sin escrituras financieras",
  "financialWrites",
  "toEqual([])",
]) requireText(regression, token, "regresion");

requireText(
  workflow,
  "tests/e2e/forecast-scenarios-10.0.82.spec.ts",
  "gate-oficial",
);

checks.push([
  !component.includes("fetch("),
  "la interfaz de escenarios no debe escribir ni leer APIs financieras directamente",
]);
checks.push([
  !engine.includes("fetch("),
  "el motor de escenarios debe ser puro y no acceder a red",
]);

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ Axioma §42 · escenarios Esperado/Conservador/Optimista certificados");
