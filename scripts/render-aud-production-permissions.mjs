import { readFileSync } from "node:fs";

// Portable backups intentionally omit ACLs. Rebuild the exact read-only
// catalog snapshot only in the guarded disposable restore, never in production.
const snapshot = JSON.parse(readFileSync(
  "supabase/tests/fixtures/production-10.0.102-permissions-20261009.json", "utf8",
));
const roles = ["PUBLIC", "anon", "authenticated", "service_role", "financial_app_gateway"];
const privileges = new Set(["USAGE", "CREATE", "SELECT", "INSERT", "UPDATE", "DELETE",
  "TRUNCATE", "REFERENCES", "TRIGGER", "EXECUTE", "MAINTAIN"]);
const types = new Set(["bigint", "boolean", "date", "integer", "jsonb", "text",
  "text[]", "time without time zone", "timestamp with time zone", "uuid", "uuid[]"]);
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
if (snapshot.appVersion !== "10.0.102"
  || snapshot.sourceCommit !== "0d278a361ba8c0dfef0c116374a21af20782abdb"
  || snapshot.projectRef !== "btzukbfesxdratqnxuoj" || snapshot.objects.length !== 157) {
  throw new Error("production_permission_snapshot_identity");
}
const sql = ["CREATE TEMP TABLE aud_expected_permissions(kind text,identity text,"
  + "definition_md5 text,grants jsonb,PRIMARY KEY(kind,identity));"];
const seen = new Set();
for (const object of snapshot.objects) {
  if (object.owner !== "postgres" || seen.has(object.kind + ":" + object.identity)) {
    throw new Error("production_permission_snapshot_owner_or_duplicate");
  }
  seen.add(object.kind + ":" + object.identity);
  if (object.kind === "FUNCTION") {
    const match = /^financial_app\.[a-z_][a-z0-9_]*\(([a-z0-9_, \[\]]*)\)$/u.exec(object.identity);
    if (!match || (match[1] && match[1].split(",").some((type) => !types.has(type)))) {
      throw new Error("production_permission_snapshot_function");
    }
    if (!/^[a-f0-9]{32}$/u.test(object.definition_md5)) throw new Error("function_hash_required");
  } else if (!(object.kind === "SCHEMA" && object.identity === "financial_app")
    && !(["TABLE", "SEQUENCE"].includes(object.kind)
      && /^financial_app\.[a-z_][a-z0-9_]*$/u.test(object.identity))) {
    throw new Error("production_permission_snapshot_object");
  }
  const grants = [...object.grants].sort((a, b) => a.role.localeCompare(b.role)
    || a.privilege.localeCompare(b.privilege));
  sql.push("INSERT INTO aud_expected_permissions VALUES (" + literal(object.kind) + ","
    + literal(object.identity) + ","
    + (object.definition_md5 ? literal(object.definition_md5) : "NULL") + ","
    + literal(JSON.stringify(grants)) + "::jsonb);");
  sql.push("REVOKE ALL ON " + object.kind + " " + object.identity + " FROM "
    + roles.map((role) => role === "PUBLIC" ? role : identifier(role)).join(",") + ";");
  for (const grant of grants) {
    if (!roles.includes(grant.role) || !privileges.has(grant.privilege)
      || typeof grant.grantable !== "boolean") throw new Error("unsupported_snapshot_grant");
    sql.push("GRANT " + grant.privilege + " ON " + object.kind + " " + object.identity
      + " TO " + (grant.role === "PUBLIC" ? "PUBLIC" : identifier(grant.role))
      + (grant.grantable ? " WITH GRANT OPTION" : "") + ";");
  }
}
process.stdout.write(sql.join("\n") + "\n");
