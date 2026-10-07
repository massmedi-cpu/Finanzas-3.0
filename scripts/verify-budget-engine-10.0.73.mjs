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
const versionAtLeast = (value, minimum) => {
  const current = value.split(".").map(Number);
  const floor = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if ((current[index] ?? 0) > (floor[index] ?? 0)) return true;
    if ((current[index] ?? 0) < (floor[index] ?? 0)) return false;
  }
  return true;
};

const pkg = JSON.parse(read("package.json"));
const migration = read("supabase/migrations/20261005041600_axioma52_budget_recommendation_engine.sql");
const splitMigration = read("supabase/migrations/20261006053545_axioma25_shared_transaction_splits_10_0_83.sql");
const batchMigration = read("supabase/migrations/20261007165000_qa_work_budget_snapshot_batch.sql");
const planning = read("src/application/budgets/budget-planning.ts");
const ui = read("app/budgets/budgets-client.tsx");

if (!versionAtLeast(pkg.version, "10.0.73")) fail(`package.json: la certificación §52 requiere 10.0.73 o posterior, recibida ${pkg.version}`);

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
requireText(
  migration,
  "revoke all on function financial_app.budget_month_recommendation(text,uuid) from service_role;",
  "migración §52 ACL gateway-only",
);
requireText(
  migration,
  "revoke all on function financial_app.budget_month_snapshot(text) from service_role;",
  "migración §52 ACL gateway-only",
);

for (const token of [
  "financial_transaction_allocation_facts",
  "'actualSource', 'financial_transaction_allocation_facts'",
  "'exclusionsSource', 'financial_transaction_allocation_facts.analytics_eligible'",
]) {
  requireText(splitMigration, token, "migración §25 reparto presupuestario");
}

for (const token of [
  "all_facts as materialized",
  "scoped_monthly as materialized",
  "financial_transaction_allocation_facts(",
  "axioma_52_budget_reference_v1",
  "floor_not_additive",
]) {
  requireText(batchMigration, token, "snapshot presupuestario por lotes");
}
forbidText(
  batchMigration,
  "financial_app.budget_month_recommendation(p_month, x.category_id)",
  "snapshot presupuestario por lotes",
);
forbidText(
  batchMigration,
  "financial_app.budget_month_actual(p_month, x.category_id)",
  "snapshot presupuestario por lotes",
);

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
  console.log(`✅ Financial App ${pkg.version} · Axioma §52 certificado`);
}
