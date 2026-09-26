import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260926175500_cover_transaction_workspace_foreign_keys.sql",
);

const expectedIndexes = [
  ["transactions_workspace_account_id_idx", "workspace_id, account_id"],
  ["transactions_workspace_category_id_idx", "workspace_id, category_id"],
  ["transactions_workspace_merchant_id_idx", "workspace_id, merchant_id"],
  ["transactions_workspace_source_record_id_idx", "workspace_id, source_record_id"],
  ["transactions_workspace_transfer_pair_id_idx", "workspace_id, transfer_pair_id"],
] as const;

test("10.0.15 cubre todas las FK workspace de movimientos con índices compuestos", () => {
  const sql = readFileSync(MIGRATION, "utf8").replace(/\s+/g, " ");

  for (const [name, columns] of expectedIndexes) {
    expect(sql).toContain(`create index if not exists ${name}`);
    expect(sql).toContain(`on financial_app.transactions (${columns})`);
  }

  expect((sql.match(/create index if not exists/g) ?? []).length).toBe(expectedIndexes.length);
});
