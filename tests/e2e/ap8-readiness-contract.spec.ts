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
    // Catalogue preflight also rejects conditional or column-restricted guards
    // and a function whose comments imitate the expected checks.
    "t.tgfoid=to_regprocedure('financial_app.prevent_private_original_rewrite()')",
    "t.tgtype=19",
    "cardinality(t.tgattr::smallint[])=0",
    "t.tgqual IS NULL",
    `p.proconfig=ARRAY['search_path=""']::text[]`,
    "sha256(convert_to(p.prosrc,'UTF8'))",
    "unverified_document_update_triggers",
    "document_update_trigger_unverified",
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
  const workflow = readFileSync(".github/workflows/product-recovery-ui.yml", "utf8");
  expect(workflow).toContain("node --test tests/unit/ap8-readiness-pg17.test.mjs");
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

test("REC-AP8-488 · rehearse SQL migrations from 26-Oct encrypted backup, not stale backup", () => {
  const workflow = readFileSync(".github/workflows/aud-e2e-production-backup-preflight.yml", "utf8");
  const start = workflow.indexOf("  restored-production-103-ap8-619:");
  expect(start).toBeGreaterThan(-1);
  const release = workflow.slice(start);
  for (const marker of [
    "github.event.pull_request.number == 619",
    "github.event.pull_request.base.ref == 'main'",
    "run = await get('/actions/runs/40274402678')",
    "a = await get('/actions/artifacts/12629204026')",
    "run.conclusion !== 'success'",
    "run.head_branch !== 'main'",
    "run.head_sha !== '29a517215fef82cb12bc80e521109c2aa326d46c'",
    "run.path !== '.github/workflows/production-backup-v2.yml'",
    "Date.parse('2026-10-26T00:00:00Z')",
    "a.expired",
    "a.workflow_run.id !== run.id",
    "Date.parse(a.expires_at) - Date.now() < 45 * 60 * 1000",
    "sha256:82127e8e63475ea726e8739f31d7944cfbfe8fb472b5a358a05e637a185b4211",
    "artifact-ids: '12629204026'",
    "run-id: '40274402678'",
    "rec-ap8-restored-backup-rehearsal.sh",
    "Restore authentic backup, upgrade five migrations, rollback and compare all data",
    "Always destroy private restored database and temporary files",
  ]) expect(release, "Missing AP8-488 guard: " + marker).toContain(marker);
  expect(release).not.toContain("12596173399");
  expect(release).not.toContain("40186296002");
  const runner = readFileSync("scripts/rec-ap8-restored-backup-rehearsal.sh", "utf8");
  expect(runner).toContain("baseline_version=10.0.103|verified_artifact=true");
  expect(runner).not.toContain("source=2026-10-20");
  expect(runner).toContain("REC_AP8_REAL_BACKUP|status=ok|authentic_restored=true|upgrade_migrations=5|rollback=true|data_digest_identical=true");
});
