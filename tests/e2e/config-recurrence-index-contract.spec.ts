import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260926185000_cover_configuration_recurrence_workspace_foreign_keys.sql",
);

const expectedIndexes = [
  ["budgets_workspace_category_id_idx", "financial_app.budgets", "workspace_id, category_id"],
  ["categories_workspace_parent_category_id_idx", "financial_app.categories", "workspace_id, parent_category_id"],
  ["merchant_aliases_workspace_merchant_id_idx", "financial_app.merchant_aliases", "workspace_id, merchant_id"],
  ["merchants_workspace_default_category_id_idx", "financial_app.merchants", "workspace_id, default_category_id"],
  ["recurrences_workspace_account_id_idx", "financial_app.recurrences", "workspace_id, account_id"],
  ["recurrences_workspace_category_id_idx", "financial_app.recurrences", "workspace_id, category_id"],
  ["recurrences_workspace_merchant_id_idx", "financial_app.recurrences", "workspace_id, merchant_id"],
] as const;

test("10.0.18 cubre las FK workspace de configuración y recurrencias", () => {
  const sql = readFileSync(MIGRATION, "utf8").replace(/\s+/g, " ");

  for (const [name, table, columns] of expectedIndexes) {
    expect(sql).toContain(`create index if not exists ${name}`);
    expect(sql).toContain(`on ${table} (${columns})`);
  }

  expect((sql.match(/create index if not exists/g) ?? []).length).toBe(expectedIndexes.length);
});
