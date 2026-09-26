import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260926174500_cover_categorization_rule_workspace_foreign_keys.sql",
);

const expectedIndexes = [
  ["categorization_rules_workspace_account_id_idx", "workspace_id, account_id"],
  ["categorization_rules_workspace_category_id_idx", "workspace_id, category_id"],
  ["categorization_rules_workspace_merchant_id_idx", "workspace_id, merchant_id"],
  ["categorization_rules_workspace_target_category_id_idx", "workspace_id, target_category_id"],
  ["categorization_rules_workspace_target_merchant_id_idx", "workspace_id, target_merchant_id"],
] as const;

test("10.0.14 cubre todas las FK workspace de reglas con índices compuestos", () => {
  const sql = readFileSync(MIGRATION, "utf8").replace(/\s+/g, " ");

  for (const [name, columns] of expectedIndexes) {
    expect(sql).toContain(`create index if not exists ${name}`);
    expect(sql).toContain(`on financial_app.categorization_rules (${columns})`);
  }

  expect((sql.match(/create index if not exists/g) ?? []).length).toBe(expectedIndexes.length);
});
