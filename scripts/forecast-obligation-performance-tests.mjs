import fs from "node:fs";

const migrationPath="database/v9.0.0-forecast-obligation-identity-performance.sql";
const ciPath=".github/workflows/ci.yml";
const migration=fs.readFileSync(migrationPath,"utf8");
const ci=fs.readFileSync(ciPath,"utf8");
const normalized=migration.replace(/\s+/g," ").toLowerCase();
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

for(const token of [
  "transactions_forecast_obligation_identity_idx",
  "forecast_obligation_fingerprint",
  "account_id",
  "coalesce(effective_date,source_date)",
  "source_missing=false",
  "is_duplicate=false",
  "is_internal_transfer=false",
  "forecast_obligation_identity_dependency_missing",
  "forecast_obligation_performance_index_invalid",
  "indisvalid",
  "indisready",
  "analyze financial_app.transactions"
])must(normalized.includes(token.toLowerCase()),`Contrato de rendimiento incompleto: ${token}`);

must(!/\b(?:insert\s+into|update|delete\s+from)\s+financial_app\.transactions\b/i.test(migration),"El cierre de rendimiento no puede mutar movimientos bancarios");
must(!/ref\.?\s+mandato/i.test(migration),"El índice no puede volver a parsear ni persistir referencias de mandato en claro");
must(!/substring\s*\([^)]*mandato/i.test(migration),"El índice debe reutilizar la huella canónica, no duplicar el parser de mandato");
must(/create\s+index\s+if\s+not\s+exists\s+transactions_forecast_obligation_identity_idx/i.test(migration),"La migración debe ser idempotente");
must(/where\s+source_missing=false\s+and\s+is_duplicate=false\s+and\s+is_internal_transfer=false/i.test(normalized),"El índice debe conservar exactamente el ámbito de movimientos elegibles");
must(ci.includes("node scripts/forecast-obligation-performance-tests.mjs"),"Financial App CI no ejecuta el gate de rendimiento de obligaciones");

if(failures.length){
  console.error("Forecast obligation performance gate FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Forecast obligation performance gate OK · índice canónico, privacidad y no-mutación protegidos");
