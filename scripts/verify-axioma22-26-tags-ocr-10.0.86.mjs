import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

const migration = read("supabase/migrations/20261006095500_axioma22_26_tags_ocr_10_0_86.sql");
const tagsRls = read("supabase/migrations/20261006103000_harden_transaction_tags_rls_10_0_86.sql");
const ocrContract = read("supabase/migrations/20261001155500_pre034_document_ocr_review_contract.sql");
const query = read("supabase/functions/financial-app-db-gateway/transaction-query.ts");
const management = read("supabase/functions/financial-app-db-gateway/transaction-management.ts");
const api = read("app/api/transactions/route.ts");
const client = read("app/transactions/transactions-client.tsx");
const tests = read("tests/e2e/transactions.spec.ts");
const pkg = JSON.parse(read("package.json"));

const versionParts = pkg.version.split(".").map(Number);
const versionAtLeast10086 =
  versionParts.length === 3 &&
  versionParts.every(Number.isInteger) &&
  (versionParts[0] > 10 ||
    (versionParts[0] === 10 && (versionParts[1] > 0 || (versionParts[1] === 0 && versionParts[2] >= 86))));
checks.push([versionAtLeast10086, "versión canónica 10.0.86 o superior"]);
requireText(ocrContract, "create table if not exists financial_app.document_ocr_runs", "prerrequisito-ocr");
for (const token of [
  "enable row level security",
  "force row level security",
  "transaction_tags_workspace_isolation",
  "financial_app.require_current_workspace_id()",
  "to financial_app_gateway",
  "revoke all on financial_app.transaction_tags from public, anon, authenticated",
]) requireText(tagsRls, token, "rls-etiquetas");
checks.push([
  String(pkg.scripts?.postbuild ?? "").includes("verify-axioma22-26-tags-ocr-10.0.86.mjs"),
  "gate 10.0.86 incluido en postbuild",
]);

for (const token of [
  "create table if not exists financial_app.transaction_tags",
  "set_transaction_tags",
  "query_effective_transactions_v4",
  "p_tag text",
  "p_ocr_query text",
  "'tags',coalesce",
  "document_ocr_runs dor",
  "dor.raw_result::text",
  "dor.interpretation::text",
  "revoke all on financial_app.transaction_tags from public,anon,authenticated",
  "to financial_app_gateway",
]) requireText(migration, token, "motor-10.0.86");

checks.push([
  !/update\s+financial_app\.transaction_source_records/i.test(migration),
  "la migración no modifica la fuente bancaria importada",
]);

const ocrClauseStart = migration.indexOf("nullif(pg_catalog.btrim(coalesce(p_ocr_query");
const generalQueryStart = migration.indexOf("nullif(pg_catalog.btrim(coalesce(p_query", ocrClauseStart);
const ocrClause = ocrClauseStart >= 0 && generalQueryStart > ocrClauseStart
  ? migration.slice(ocrClauseStart, generalQueryStart)
  : "";
checks.push([ocrClause.includes("document_ocr_runs dor"), "OCR dedicado consulta evidencia OCR real"]);
checks.push([!ocrClause.includes("da.confirmed=true"), "OCR dedicado no excluye evidencia asociada pendiente/no confirmada"]);

for (const token of [
  "query_effective_transactions_v4",
  "transaction_tag",
  "transaction_ocr_query",
  "tags:",
]) requireText(query, token, "gateway-consulta");

for (const token of [
  '"tags"',
  "transactionTags",
  "set_transaction_tags",
  "sql.begin",
]) requireText(management, token, "gateway-escritura");

for (const token of [
  'optionalText(searchParams, "tag", 40)',
  'optionalText(searchParams, "ocrQuery", 200)',
  "normalizeTransactionTags",
  "transaction_tags_single_edit_only",
]) requireText(api, token, "api");

for (const token of [
  "tags: string[]",
  "tag: string",
  "ocrQuery: string",
  'data-testid="tag-filter"',
  'data-testid="ocr-filter"',
  'data-testid="edit-tags"',
  "normalizedTagsFromEditor",
  "Hasta 12 etiquetas",
  "Texto OCR",
  "Etiquetas",
]) requireText(client, token, "ui");

for (const token of [
  "10.0.86 · etiquetas generales y OCR son filtros combinables",
  "10.0.86 · edición de etiquetas valida el límite",
  'url.searchParams.get("tag") === "reembolsable"',
  'url.searchParams.get("ocrQuery") === "ticket supermercado"',
]) requireText(tests, token, "regresión");

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ Axioma §22/§26 · etiquetas generales + OCR certificados estáticamente");
