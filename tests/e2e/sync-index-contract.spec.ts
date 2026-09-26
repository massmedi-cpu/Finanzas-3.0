import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260926184000_cover_sync_workspace_foreign_keys.sql",
);

const expectedIndexes = [
  ["account_source_mappings_workspace_account_id_idx", "financial_app.account_source_mappings", "workspace_id, account_id"],
  ["sync_cursors_workspace_last_successful_run_id_idx", "financial_app.sync_cursors", "workspace_id, last_successful_run_id"],
  ["sync_issues_workspace_sync_run_id_idx", "financial_app.sync_issues", "workspace_id, sync_run_id"],
] as const;

test("10.0.17 cubre las FK workspace del ciclo de sincronización", () => {
  const sql = readFileSync(MIGRATION, "utf8").replace(/\s+/g, " ");

  for (const [name, table, columns] of expectedIndexes) {
    expect(sql).toContain(`create index if not exists ${name}`);
    expect(sql).toContain(`on ${table} (${columns})`);
  }

  expect((sql.match(/create index if not exists/g) ?? []).length).toBe(expectedIndexes.length);
});
