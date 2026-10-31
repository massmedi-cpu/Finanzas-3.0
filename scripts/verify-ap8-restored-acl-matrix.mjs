import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// REC-AP8-314 · no database or network connections; fail before private
// encrypted backups are downloaded on GitHub Actions.
const SQL_PATH = "supabase/tests/rec_ap8_restored_backup_upgrade_rollback.sql";
const PERMITTED = new Set(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]);
const TABLE_NAME = /^[a-z_][a-z0-9_]*$/;
function fail(code) { throw new Error(code); }
function equalSets(a, b) { return a.size === b.size && [...a].every((v) => b.has(v)); }
export function verifyRestoredAclSql(sql) {
  const block = sql.match(/FOR r IN SELECT \* FROM \(VALUES\s*([\s\S]*?)\s*\) AS acl\(table_name, privileges\) LOOP/);
  if (!block) fail("AP8_ACL_VALUES_BLOCK_MISSING");
  const lines = block[1].trim().split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 32) fail("AP8_ACL_EXPECTED_EXACTLY_32_TABLES");
  const expected = new Map();
  const rowPattern = /^\('([a-z_][a-z0-9_]*)', ARRAY\[((?:'(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)'(?:,)?)*)\]::text\[\]\),?$/;
  for (const line of lines) {
    const row = line.match(rowPattern);
    if (!row) fail("AP8_ACL_INVALID_SQL_LITERAL_OR_ROLE");
    const table = row[1];
    const roles = [...row[2].matchAll(/'([A-Z]+)'/g)].map((m) => m[1]);
    const distinct = new Set(roles);
    if (distinct.size !== roles.length || roles.some((role) => !PERMITTED.has(role)) || expected.has(table)) {
      fail("AP8_ACL_DUPLICATE_OR_ESCALATED");
    }
    expected.set(table, distinct);
  }
  if (!expected.has("documents") || !expected.get("documents").has("INSERT") ||
      expected.get("authorized_users").size || expected.get("workspace_memberships").size ||
      expected.get("workspaces").size || expected.get("schema_meta").size) {
    fail("AP8_ACL_RESTRICTED_ROLE_BASELINE_BROKEN");
  }
  const grants = new Map();
  const grantLines = sql.split("\n").map((line) => line.trim())
    .filter((line) => /^GRANT\s+/i.test(line) && /TO financial_app_gateway\s*;$/i.test(line));
  const grantPattern = /^GRANT ((?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)(?:, (?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER))*) ON financial_app\.([a-z_][a-z0-9_]*) TO financial_app_gateway;$/;
  for (const line of grantLines) {
    if (line === "GRANT USAGE ON SCHEMA financial_app TO financial_app_gateway;") continue;
    const match = line.match(grantPattern);
    if (!match) fail("AP8_ACL_INVALID_GRANT_STATEMENT");
    const roles = match[1].split(", ");
    if (grants.has(match[2]) || roles.length !== new Set(roles).size) fail("AP8_ACL_DUPLICATE_GRANT");
    grants.set(match[2], new Set(roles));
  }
  const permittedTables = [...expected.keys()].filter((name) => expected.get(name).size > 0);
  if (grants.size !== permittedTables.length) fail("AP8_ACL_MISSING_OR_EXTRA_GRANT");
  for (const [name, roles] of expected) {
    if (!TABLE_NAME.test(name) || !equalSets(roles, grants.get(name) ?? new Set())) fail("AP8_ACL_GRANT_DIFFERS_FROM_MATRIX");
  }
  for (const required of [
    "REVOKE ALL ON ALL TABLES IN SCHEMA financial_app FROM financial_app_gateway;",
    "GRANT USAGE ON SCHEMA financial_app TO financial_app_gateway;",
    "REC_AP8_RESTORED_GATEWAY_ACL_MISMATCH",
    "REC_AP8_RESTORED_GATEWAY_TABLES_MISMATCH",
    "REC_AP8_DELTA|rollback=passed",
    "REC_AP8_DELTA|status=ok|baseline=authentic_10_0_103_restored",
  ]) if (!sql.includes(required)) fail("AP8_ACL_REQUIRED_GUARD_MISSING");
  const pathPattern = /\\i supabase\/migrations\/20[0-9]+_[a-z0-9_]+\.sql/g;
  const included = [...sql.matchAll(pathPattern)].map((m) => m[0]);
  const requiredMigrations = [
    "\\i supabase/migrations/20261011205000_ap1_private_document_original_immutable.sql",
    "\\i supabase/migrations/20261017154629_optimize_transaction_category_labels.sql",
    "\\i supabase/migrations/20261017160009_batch_transaction_split_facts.sql",
    "\\i supabase/migrations/20261017160345_statement_workspace_policy_context.sql",
    "\\i supabase/migrations/20261024145500_rec_rel_430_archived_balance_series_scope.sql",
  ];
  if (included.length !== requiredMigrations.length ||
      !equalSets(new Set(included), new Set(requiredMigrations))) {
    fail("AP8_ACL_REQUIRED_FIVE_MIGRATIONS_MISSING_OR_EXTRA");
  }
  return { tables: expected.size, permittedTables: permittedTables.length };
}
function selfTest(sql) {
  const valid = verifyRestoredAclSql(sql);
  assert.equal(valid.tables, 32);
  assert.equal(valid.permittedTables, 27);
  const bad = [
    [sql.replace("('account_source_mappings'", '("account_source_mappings"'), "AP8_ACL_INVALID_SQL_LITERAL_OR_ROLE"],
    [sql.replace("GRANT SELECT, INSERT, UPDATE, DELETE ON financial_app.documents", "GRANT SELECT, UPDATE, DELETE ON financial_app.documents"), "AP8_ACL_GRANT_DIFFERS_FROM_MATRIX"],
    [sql.replace("('workspaces', ARRAY[]::text[])", "('workspaces', ARRAY['SELECT']::text[])"), "AP8_ACL_RESTRICTED_ROLE_BASELINE_BROKEN"],
    [sql.replace("REVOKE ALL ON ALL TABLES IN SCHEMA financial_app FROM financial_app_gateway;", "-- removed"), "AP8_ACL_REQUIRED_GUARD_MISSING"],
    [sql.replace("\\i supabase/migrations/20261024145500_rec_rel_430_archived_balance_series_scope.sql", "-- missing archived fix"), "AP8_ACL_REQUIRED_FIVE_MIGRATIONS_MISSING_OR_EXTRA"],
  ];
  for (const [altered, code] of bad) {
    if (altered === sql) fail("AP8_ACL_TEST_FIXTURE_NOT_CHANGED");
    assert.throws(() => verifyRestoredAclSql(altered), (error) => error.message === code, code);
  }
  return valid;
}
const code = readFileSync(SQL_PATH, "utf8");
const verified = selfTest(code);
console.log("REC_AP8_ACL_STATIC|status=ok|tables="+verified.tables+
  "|grants="+verified.permittedTables+"|negative_cases=5|database_access=false|private_values=false");
