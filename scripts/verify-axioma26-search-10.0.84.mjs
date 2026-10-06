import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const requireText = (source, token, label) => checks.push([source.includes(token), `${label}: ${token}`]);

const migration = read("supabase/migrations/20261006082500_axioma26_advanced_transaction_search_10_0_84.sql");
const query = read("supabase/functions/financial-app-db-gateway/transaction-query.ts");
const api = read("app/api/transactions/route.ts");
const client = read("app/transactions/transactions-client.tsx");
const pkg = JSON.parse(read("package.json"));

const versionParts = String(pkg.version).split(".").map(Number);
const minVersion = [10, 0, 84];
const versionAtLeast10084 =
  versionParts.length === 3 &&
  versionParts.every(Number.isInteger) &&
  versionParts.some((part, index) => part !== minVersion[index])
    ? versionParts.findIndex((part, index) => part !== minVersion[index]) >= 0 &&
      versionParts[versionParts.findIndex((part, index) => part !== minVersion[index])] >
        minVersion[versionParts.findIndex((part, index) => part !== minVersion[index])]
    : versionParts.length === 3 && versionParts.every((part, index) => part === minVersion[index]);

checks.push([versionAtLeast10084, "versión canónica 10.0.84+"]);

for (const token of [
  "query_effective_transactions_v2",
  "p_amount_from_cents",
  "p_amount_to_cents",
  "e.amount_cents>=p_amount_from_cents",
  "e.amount_cents<=p_amount_to_cents",
  "e.user_note",
  "e.source_row_key",
  "revoke all on function financial_app.query_effective_transactions_v2",
  "to financial_app_gateway",
]) requireText(migration, token, "motor-busqueda");

checks.push([
  !/update\s+financial_app\.transaction_source_records/i.test(migration),
  "la búsqueda no modifica transaction_source_records",
]);

for (const token of [
  "nullableSafeInteger",
  "amountFromCents",
  "amountToCents",
  "invalid_transaction_amount_range",
]) requireText(query, token, "gateway-busqueda");

checks.push([
  /query_effective_transactions_v\d+\(/.test(query),
  "gateway-busqueda: motor versionado de query_effective_transactions",
]);

for (const token of [
  "optionalSafeInteger",
  'optionalSafeInteger(searchParams, "amountFromCents")',
  'optionalSafeInteger(searchParams, "amountToCents")',
  "invalid_amount_range",
]) requireText(api, token, "api-busqueda");

for (const token of [
  "moneyFilterToCents",
  "centsParamToMoneyFilter",
  "amountFrom",
  "amountTo",
  "Importe mínimo",
  "Importe máximo",
  "Concepto",
  "comercio",
  "categoría",
  "nota",
]) requireText(client, token, "ui-busqueda");

const failures = checks.filter(([ok]) => !ok);
for (const [, label] of failures) console.error(`❌ ${label}`);
if (failures.length) process.exitCode = 1;
else console.log("✅ Axioma §26 · búsqueda avanzada tramo 1 certificada (10.0.84+)");
