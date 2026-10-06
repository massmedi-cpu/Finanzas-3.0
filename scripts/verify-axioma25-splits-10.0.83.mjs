import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

const migration = read("supabase/migrations/20261006053545_axioma25_shared_transaction_splits_10_0_83.sql");
const documentMigration = read("supabase/migrations/20261006054054_axioma25_document_bank_amount_matching_10_0_83.sql");
const management = read("supabase/functions/financial-app-db-gateway/transaction-management.ts");
const query = read("supabase/functions/financial-app-db-gateway/transaction-query.ts");
const gateway = read("supabase/functions/financial-app-db-gateway/index.ts");
const api = read("app/api/transactions/route.ts");
const editor = read("app/transactions/transaction-split-editor.tsx");
const client = read("app/transactions/transactions-client.tsx");
const analysis = read("supabase/functions/financial-app-db-gateway/analysis-query.ts");

for (const token of [
  "transaction_split_allocations",
  "source_amount_cents",
  "save_transaction_split",
  "transaction_split_snapshot",
  "financial_transaction_allocation_facts",
  "transaction_split_amount_mismatch",
  "allocation_scope in ('personal','other')",
  "enable row level security",
  "budget_month_actual",
  "budget_month_recommendation",
]) requireText(migration, token, "persistencia-reparto");

checks.push([
  !/update\s+financial_app\.transactions/i.test(migration),
  "el reparto nunca debe reescribir financial_app.transactions",
]);

for (const token of [
  "matchingAmountSource','bank_original'",
  "t.amount_cents",
  "sharedSplitAffectsMatching',false",
]) requireText(documentMigration, token, "documentos-importe-bancario");

for (const token of [
  '"transaction.split_save"',
  "save_transaction_split",
  '"test.transaction_split_engine"',
  "__ROLLBACK_TRANSACTION_SPLIT_TEST__",
]) requireText(management, token, "gateway-escritura");

for (const token of [
  '"transaction.split_detail"',
  "transaction_split_snapshot",
  "overriddenFields.push(\"split\")",
]) requireText(query, token, "gateway-lectura");

for (const token of [
  '"transaction.split_detail"',
  '"test.transaction_split_engine"',
]) requireText(gateway, token, "preview-seguro");

for (const token of [
  'mode === "split"',
  'export async function PUT',
  '"transaction.split_save"',
]) requireText(api, token, "api-reparto");

for (const token of [
  "Repartir movimiento",
  "Parte personal",
  "Otras personas",
  "Falta repartir",
  "Guardar reparto",
  "Eliminar reparto",
  "difference === 0",
]) requireText(editor, token, "editor-reparto");

for (const token of [
  "TransactionSplitEditor",
  "Repartido",
  "Reparto por revisar",
  "Varias categorías",
  "Personal:",
]) requireText(client, token, "integracion-movimientos");

for (const token of [
  "financial_transaction_allocation_facts",
  "allocation_expenses",
  "count(distinct e.transaction_id)",
]) requireText(analysis, token, "analitica-multicategoria");

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ Axioma §25 · repartos personales, compartidos y multicategoría certificados");
