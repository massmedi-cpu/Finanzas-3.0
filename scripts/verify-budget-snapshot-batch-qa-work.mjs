import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20261007165000_qa_work_budget_snapshot_batch.sql",
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  migration.includes("create or replace function financial_app.budget_month_snapshot"),
  "missing budget_month_snapshot replacement",
);
assert(
  migration.includes("all_facts as materialized"),
  "budget snapshot must materialize financial facts once",
);
assert(
  migration.includes("financial_transaction_allocation_facts("),
  "budget snapshot must preserve split-aware financial facts",
);
assert(
  migration.includes("'actualSource', 'financial_transaction_allocation_facts'"),
  "budget snapshot must preserve allocation facts as actual source",
);
assert(
  migration.includes("'exclusionsSource',\n            'financial_transaction_allocation_facts.analytics_eligible'"),
  "budget snapshot must preserve Axioma §52 exclusions source",
);

const bodyStart = migration.indexOf(
  "create or replace function financial_app.budget_month_snapshot",
);
const bodyEnd = migration.indexOf(
  "revoke all on function financial_app.budget_month_snapshot",
);
assert(bodyStart >= 0 && bodyEnd > bodyStart, "unable to isolate snapshot body");

const body = migration.slice(bodyStart, bodyEnd);
assert(
  !body.includes("financial_app.budget_month_recommendation("),
  "snapshot must not invoke per-category recommendation functions",
);
assert(
  !body.includes("financial_app.budget_month_actual("),
  "snapshot must not invoke per-category actual functions",
);

const allocationCalls = body.match(
  /financial_app\.financial_transaction_allocation_facts\s*\(/g,
) ?? [];
assert(
  allocationCalls.length === 1,
  `snapshot must scan allocation facts once; found ${allocationCalls.length}`,
);

for (const token of [
  "fallback_3_month_average",
  "axioma_52_weighted",
  "seasonalSameMonthCents",
  "trendAdjustmentCents",
  "knownRecurringCents",
  "extraordinaryMonthCount",
  "floor_not_additive",
  "parentCategoryIncludesDescendants",
]) {
  assert(migration.includes(token), `missing preserved budget semantic: ${token}`);
}

console.log("Budget snapshot batch QA: migration contract passed");
