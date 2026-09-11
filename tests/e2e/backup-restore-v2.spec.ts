import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const creator = readFileSync("scripts/create-financial-backup-v2.mjs", "utf8");
const validator = readFileSync("scripts/validate-financial-backup-v2.mjs", "utf8");
const rehearsal = readFileSync("scripts/phase13-restore-rehearsal-v2.sh", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const workflow = readFileSync(".github/workflows/backup-v2-restore-rehearsal.yml", "utf8");

test("backup v2 · descubre versión, schema y Storage en vez de confiar en cifras fijas", () => {
  expect(creator).toContain('readFileSync(packageJsonPath');
  expect(creator).toContain("schema_version::text");
  expect(creator).toContain("from storage.buckets");
  expect(creator).toContain("from storage.objects");
  expect(creator).toContain("storage-inventory.json");
  expect(creator).not.toContain('appVersion: \"0.0.1\"');
  expect(creator).not.toContain('targetVersion: \"10.0.0\"');
});

test("backup v2 · no restaura acceso, solicitudes de borrado ni activación destructiva", () => {
  for (const table of [
    "financial_app.google_oauth_connections",
    "financial_app.authorized_users",
    "financial_app.workspace_memberships",
    "financial_app.workspace_deletion_intents",
    "financial_app.workspace_deletion_runtime_policy",
  ]) {
    expect(creator).toContain(table);
    expect(validator).toContain(table.replace("financial_app.", ""));
  }
  expect(creator).toContain("deletionMustBeReapprovedAfterRestore: true");
  expect(validator).toContain("deletionMustBeReapprovedAfterRestore !== true");
});

test("backup v2 · Storage con objetos exige archivo real y el inventario debe cuadrar", () => {
  expect(creator).toContain("objectCount > 0");
  expect(creator).toContain("FINANCIAL_APP_STORAGE_ARCHIVE");
  expect(validator).toContain("storage_inventory_count_mismatch");
  expect(validator).toContain("storage_archive_required");
});

test("backup v2 · sirve antes y después de tenancy mediante capabilities", () => {
  expect(creator).toContain("workspaceTenancy");
  expect(creator).toContain("deletionRuntime");
  expect(creator).toContain("deletionIntent");
  expect(validator).toContain("if (capabilities.workspaceTenancy)");
  expect(validator).toContain("if (capabilities.deletionRuntime)");
});

test("restore v2 · recupera datos, reprovisiona acceso aparte y deja borrado apagado", () => {
  expect(rehearsal).toContain("seed_user_before_tenancy");
  expect(rehearsal).toContain("workspace_memberships");
  expect(rehearsal).toContain("deletion_policy_rows");
  expect(rehearsal).toContain('post_policy\" != \"0\"');
  expect(rehearsal).toContain("bank_source_policy");
  expect(rehearsal).toContain("create-financial-backup-v2.mjs");
  expect(rehearsal).toContain("validate-financial-backup-v2.mjs");
});

test("backup v2 · los comandos nuevos conviven con F13 v1", () => {
  expect(pkg.scripts["backup:create"]).toBe("node scripts/create-financial-backup.mjs");
  expect(pkg.scripts["backup:validate"]).toBe("node scripts/validate-financial-backup.mjs");
  expect(pkg.scripts["backup:create:v2"]).toBe("node scripts/create-financial-backup-v2.mjs");
  expect(pkg.scripts["backup:validate:v2"]).toBe("node scripts/validate-financial-backup-v2.mjs");
});

test("backup v2 · tiene rehearsal CI separado y no sustituye el workflow F13", () => {
  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).toContain("[backup-v2-restore]");
  expect(workflow).toContain("postgres:17");
  expect(workflow).toContain("phase13-restore-rehearsal-v2.sh");
});
