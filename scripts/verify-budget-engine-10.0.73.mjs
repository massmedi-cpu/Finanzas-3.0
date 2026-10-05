import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
};
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label}: falta ${needle}`);
};
const forbidText = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label}: no debe contener ${needle}`);
};

const pkg = JSON.parse(read("package.json"));
const migration = read("supabase/migrations/20261005041600_axioma52_budget_recommendation_engine.sql");
const planning = read("src/application/budgets/budget-planning.ts");
const ui = read("app/budgets/budgets-client.tsx");

if (pkg.version !== "10.0.73") fail(`package.json: versión esperada 10.0.73, recibida ${pkg.version}`);

for (const token of [
  "axioma_52_budget_reference_v1",
  "financial_transaction_facts",
  "analytics_eligible",
  "seasonalSameMonthCents",
  "trendAdjustmentCents",
  "knownRecurringCents",
  "extraordinaryMonthCount",
  "floor_not_additive",
  "security invoker",
  "to financial_app_gateway",
]) {
  requireText(migration, token, "migración §52");
}
forbidText(migration, "to service_role", "migración §52 ACL");

requireText(planning, 'historicalBaseline: "axioma_52_budget_reference"', "contrato planificación");
requireText(planning, "automaticFactors", "contrato planificación");
forbidText(planning, "historyAverageCents === snapshot.total.automaticAmountCents", "conciliación planificación");

requireText(ui, "Referencia automática", "UI presupuestos");
requireText(ui, "motor Axioma §52", "UI presupuestos");
for (const stale of [
  "Media real de los 3 meses completos anteriores",
  "Es lo que gastaste de media. Describe el pasado",
  "proyección determinista con tus tres meses completos anteriores",
  "Referencia histórica · media de 3 meses",
]) {
  forbidText(ui, stale, "UI presupuestos");
}

if (!process.exitCode) {
  console.log("✅ Financial App 10.0.73 · Axioma §52 certificado");
}
