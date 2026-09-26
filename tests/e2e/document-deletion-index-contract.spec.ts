import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260926191000_cover_document_deletion_foreign_keys.sql",
);

const expectedIndexes = [
  ["document_transaction_associations_workspace_document_id_idx", "financial_app.document_transaction_associations", "workspace_id, document_id"],
  ["document_transaction_associations_workspace_transaction_id_idx", "financial_app.document_transaction_associations", "workspace_id, transaction_id"],
  ["workspace_deletion_intents_requested_by_user_id_idx", "financial_app.workspace_deletion_intents", "requested_by_user_id"],
] as const;

test("10.0.20 cubre las FK restantes de documentos y borrado", () => {
  const sql = readFileSync(MIGRATION, "utf8").replace(/\s+/g, " ");

  for (const [name, table, columns] of expectedIndexes) {
    expect(sql).toContain(`create index if not exists ${name}`);
    expect(sql).toContain(`on ${table} (${columns})`);
  }

  expect((sql.match(/create index if not exists/g) ?? []).length).toBe(expectedIndexes.length);
});
