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
    "standalone_document_table",
    "document_relation_shape_unverified",
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

test("REC-AP8-503 · rehearse against the newest independently verified recent encrypted backup", () => {
  const workflow = readFileSync(".github/workflows/aud-e2e-production-backup-preflight.yml", "utf8");
  const start = workflow.indexOf("  restored-production-103-ap8-619:");
  expect(start).toBeGreaterThan(-1);
  const release = workflow.slice(start);
  for (const marker of [
    "github.event.pull_request.number == 619",
    "github.event.pull_request.base.ref == 'main'",
    "node --test tests/unit/ap8-verified-backup.test.mjs",
    "id: recent_backup",
    "node scripts/rec-ap8-verified-backup.mjs",
    "artifact-ids: ${{ steps.recent_backup.outputs.artifact_id }}",
    "run-id: ${{ steps.recent_backup.outputs.run_id }}",
    "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
    "digest-mismatch: error",
    "node scripts/rec-ap8-verified-backup.mjs --verify-release-identity",
    "rec-ap8-restored-backup-rehearsal.sh",
    "Restore authentic backup, upgrade five migrations, rollback and compare all data",
    "Always destroy private restored database and temporary files",
  ]) expect(release, "Missing AP8-503 guard: " + marker).toContain(marker);
  expect(release).not.toContain("artifact-ids: '12629204026'");
  expect(workflow).toContain("'scripts/rec-ap8-verified-backup.mjs'");
  expect(workflow).toContain("'tests/unit/ap8-verified-backup.test.mjs'");
  const selector = readFileSync("scripts/rec-ap8-verified-backup.mjs", "utf8");
  for (const marker of [
    "29a517215fef82cb12bc80e521109c2aa326d46c",
    "6dad59c6c2db3575618a7c91c49c3060a93bbba1",
    "dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5",
    "repositoryId: 1340586543",
    "workflowId: 369930224",
    "productionVersion: '10.0.103'",
    "maxAgeMs: 24 * 60 * 60 * 1000",
    "minRemainingMs: 45 * 60 * 1000",
    "restore-verify-v2",
    "backup_run_untrusted",
    "backup_artifact_untrusted",
  ]) expect(selector, "Missing AP8-503 policy: " + marker).toContain(marker);
  const runner = readFileSync("scripts/rec-ap8-restored-backup-rehearsal.sh", "utf8");
  expect(runner).toContain("baseline_version=10.0.103|verified_artifact=true");
  expect(runner).not.toContain("source=2026-10-20");
  // Both baseline generations must be distinguishable: five migrations are only
  // upgraded and rolled back on a pre-DDL authentic backup. A post-DDL backup
  // must be audited read-only, without replaying already applied migrations.
  expect(runner).toContain("mode='pre_ddl'");
  expect(runner).toContain("mode='post_ddl'");
  expect(runner).toContain("rec_ap8_restored_backup_upgrade_rollback.sql");
  expect(runner).toContain("rec_ap8_restored_post_ddl_audit.sql");
  expect(runner).toContain("REC_AP8_DELTA|rollback=passed");
  expect(runner).toContain("REC_AP8_POST_DDL|status=ok|checked_points=384|data_read_only=true");
  expect(runner).toContain("post_ddl_readiness_blocked");
  expect(runner).toContain('[[ "$final_guard" == "$baseline_guard" ]] || fail guard_baseline_changed');
  expect(runner).toContain("baseline=pre_ddl|original_guard=rolled_back|upgrade_migrations=5|rollback=true|data_digest_identical=true");
  // A restored post-DDL backup must verify the synthetic 30-row append-only
  // rehearsal and original row digests before reporting a successful audit.
  expect(runner).toContain("REC_SYNC_AP5_REHEARSAL|status=ok|inserts=30|replay_skips=30|checking=27|savings=3|conflict_rolls_back=true|workspace_isolated=true|no_residue=true");
  expect(runner).toContain("REC_AP8_POST_DDL_SYNTHETIC|status=ok|inserts=30|replay_skips=30|rollback=clean|original_digests_preserved=true");
  expect(runner).toContain("baseline=post_ddl|original_guard=preserved|financial_data_writes=false|synthetic_append_rollback=passed|original_digests_preserved=true|upgrade_migrations=already_applied");
  expect(runner).toContain("live_production_writes=false");
});
