import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260926190000_cover_transaction_support_workspace_foreign_keys.sql",
);

const expectedIndexes = [
  ["transaction_duplicate_reviews_workspace_reviewed_source_record_id_idx", "financial_app.transaction_duplicate_reviews", "workspace_id, reviewed_source_record_id"],
  ["transaction_duplicate_reviews_workspace_transaction_id_idx", "financial_app.transaction_duplicate_reviews", "workspace_id, transaction_id"],
  ["transaction_overrides_workspace_category_id_override_idx", "financial_app.transaction_overrides", "workspace_id, category_id_override"],
  ["transaction_overrides_workspace_merchant_id_override_idx", "financial_app.transaction_overrides", "workspace_id, merchant_id_override"],
  ["transaction_overrides_workspace_transaction_id_idx", "financial_app.transaction_overrides", "workspace_id, transaction_id"],
  ["transaction_source_records_workspace_supersedes_source_record_id_idx", "financial_app.transaction_source_records", "workspace_id, supersedes_source_record_id"],
] as const;

test("10.0.19 cubre las FK workspace de soporte e integridad de movimientos", () => {
  const sql = readFileSync(MIGRATION, "utf8").replace(/\s+/g, " ");

  for (const [name, table, columns] of expectedIndexes) {
    expect(sql).toContain(`create index if not exists ${name}`);
    expect(sql).toContain(`on ${table} (${columns})`);
  }

  expect((sql.match(/create index if not exists/g) ?? []).length).toBe(expectedIndexes.length);
});
