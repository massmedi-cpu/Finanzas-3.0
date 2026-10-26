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

test("REC-AP8-487 · el backup cifrado sigue disponible tras mover #619 a main sin confiar en eventos obsoletos", () => {
  const workflow = readFileSync(".github/workflows/rec-ap8-fresh-backup-dispatch.yml", "utf8");
  expect(workflow).toContain("branches: [main, chat/twenty-one-routes-responsive-shell-20261010]");
  expect(workflow).toContain("github.event.pull_request.number == 619");
  expect(workflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
  expect(workflow).toContain("github.event.pull_request.head.ref == 'chat/integrated-b-e-c-visual-20261010'");
  expect(workflow).toContain("github.event.pull_request.base.ref == 'main'");
  expect(workflow).toContain("github.event.pull_request.base.ref == 'chat/twenty-one-routes-responsive-shell-20261010'");
  expect(workflow).toContain("livePr.base.ref !== event.base.ref");
  expect(workflow).toContain("livePr.head.sha !== event.head.sha");
  expect(workflow).toContain("livePr.state !== 'open'");
  expect(workflow).toContain("productionCommit: '6dad59c6c2db3575618a7c91c49c3060a93bbba1'");
  expect(workflow).toContain("expected.version");
  expect(workflow).toContain("expected.deployment");
  expect(workflow).toContain("workflow: 'production-backup-v2.yml'");
  expect(workflow).toContain("ref:'main'");
  expect(workflow).not.toContain("FINANCIAL_APP_BACKUP_PASSPHRASE: ${{");
  expect(workflow).not.toContain("SUPABASE_DB_URL: ${{");
  expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY: ${{");
});
