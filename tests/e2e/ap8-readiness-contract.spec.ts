import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("REC-AP8-308 · la comprobación productiva AP8 es estrictamente de lectura, sin datos personales ni falsas certificaciones", () => {
  const sql = readFileSync("scripts/rec-ap8-readiness-readonly.sql", "utf8");
  const operations = sql.replace(/--[^\n]*/g, " ");
  expect(operations).toMatch(/\bBEGIN READ ONLY\s*;/i);
  expect(operations).toMatch(/\bCOMMIT\s*;/i);
  expect(operations).not.toMatch(/\b(?:insert\s+into|update\s+[a-z_]|delete\s+from|truncate\s+table|alter\s+table|create\s+(?:function|trigger|table|policy)|drop\s+(?:function|trigger|table)|grant\s+|revoke\s+)\b/i);
  for (const proof of [
    "documents_private_original_rewrite_guard",
    "prevent_private_original_rewrite",
    // REC-AP1-338: catalogue preflight cannot accept a trigger with the right
    // name but a wrong function, timing or operation, nor one missing Drive ID.
    "t.tgfoid=to_regprocedure('financial_app.prevent_private_original_rewrite()')",
    "(t.tgtype & 1)=1",
    "(t.tgtype & 2)=2",
    "(t.tgtype & 16)=16",
    "pg_get_functiondef(p.oid)",
    "NEW.source_drive_file_id IS DISTINCT FROM OLD.source_drive_file_id",
    "table_count<>tables_with_rls",
    "t.source_record_id",
    "transactions_without_source",
    "sources_without_transaction",
    "has_function_privilege('anon'",
    "has_function_privilege('authenticated'",
    "ap8_db_readiness",
    "'blocked'",
    "original_immutability_missing",
  ]) expect(sql, "Falta la comprobación AP8: " + proof).toContain(proof);
  expect(sql).not.toContain("source_postflight_verified=true");
});
