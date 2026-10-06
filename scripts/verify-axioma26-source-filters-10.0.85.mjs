import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

const migration = read("supabase/migrations/20261006090000_axioma26_source_filters_10_0_85.sql");
const query = read("supabase/functions/financial-app-db-gateway/transaction-query.ts");
const api = read("app/api/transactions/route.ts");
const client = read("app/transactions/transactions-client.tsx");
const pkg = JSON.parse(read("package.json"));

checks.push([pkg.version === "10.0.85", "versión canónica 10.0.85"]);

for (const token of [
  "query_effective_transactions_v3",
  "p_channel text",
  "p_counterparty text",
  "p_reconciliation text",
  "p_recurring boolean",
  "p_internal_transfer boolean",
  "p_has_document boolean",
  "p_document_query text",
  "p_split_label text",
  "source_payload->>'Canal'",
  "source_payload->>'Comercio o contraparte'",
  "source_payload->>'Conciliado'",
  "forecast_items",
  "document_transaction_associations",
  "transaction_split_allocations",
  "revoke all on function financial_app.query_effective_transactions_v3",
  "to financial_app_gateway",
]) requireText(migration, token, "motor-v3");

checks.push([
  !/update\s+financial_app\.transaction_source_records/i.test(migration),
  "la migración no modifica transaction_source_records",
]);

for (const token of [
  "query_effective_transactions_v3",
  "transaction_channel",
  "transaction_counterparty",
  "transaction_reconciliation",
  "transaction_recurring",
  "transaction_internal_transfer",
  "transaction_has_document",
  "transaction_document_query",
  "transaction_split_label",
  "reconciliationStates",
  "years:",
]) requireText(query, token, "gateway-v3");

for (const token of [
  'optionalText(searchParams, "channel", 120)',
  'optionalText(searchParams, "counterparty", 200)',
  'optionalText(searchParams, "reconciliation", 120)',
  'optionalBoolean(searchParams, "recurring")',
  'optionalBoolean(searchParams, "internalTransfer")',
  'optionalBoolean(searchParams, "hasDocument")',
  'optionalText(searchParams, "documentQuery", 200)',
  'optionalText(searchParams, "splitLabel", 200)',
  'optionalSafeInteger(searchParams, "year")',
  'optionalSafeInteger(searchParams, "month")',
  "invalid_month_without_year",
]) requireText(api, token, "api-v3");

for (const token of [
  "channels: string[]",
  "reconciliationStates: string[]",
  "years: number[]",
  "counterparty: string",
  "recurring: string",
  "internalTransfer: string",
  "hasDocument: string",
  "documentQuery: string",
  "splitLabel: string",
  "Canal",
  "Contraparte",
  "Conciliación",
  "Solo recurrentes confirmados",
  "Solo transferencias internas",
  "Con documento asociado",
  "Buscar en documento",
  "Etiqueta de reparto",
  "Año",
  "Mes",
]) requireText(client, token, "ui-v3");

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ Axioma §26 · filtros de fuente/documentos/recurrentes certificados");
