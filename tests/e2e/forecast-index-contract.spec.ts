import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260926180500_cover_forecast_workspace_foreign_keys.sql",
);

const expectedIndexes = [
  ["forecast_items_workspace_account_id_idx", "workspace_id, account_id"],
  ["forecast_items_workspace_budget_id_idx", "workspace_id, budget_id"],
  ["forecast_items_workspace_category_id_idx", "workspace_id, category_id"],
  ["forecast_items_workspace_confirmed_transaction_id_idx", "workspace_id, confirmed_transaction_id"],
  ["forecast_items_workspace_merchant_id_idx", "workspace_id, merchant_id"],
  ["forecast_items_workspace_recurrence_id_idx", "workspace_id, recurrence_id"],
] as const;

test("10.0.16 cubre todas las FK workspace de Previsión con índices compuestos", () => {
  const sql = readFileSync(MIGRATION, "utf8").replace(/\s+/g, " ");

  for (const [name, columns] of expectedIndexes) {
    expect(sql).toContain(`create index if not exists ${name}`);
    expect(sql).toContain(`on financial_app.forecast_items (${columns})`);
  }

  expect((sql.match(/create index if not exists/g) ?? []).length).toBe(expectedIndexes.length);
});
