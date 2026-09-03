import fs from "node:fs";

const migrationPath="database/v9.0.0-forecast-obligation-identity-performance.sql";
const matchWindowPath="database/FINANCIAL_APP_9.0.0_FORECAST_MATCH_WINDOW_PERFORMANCE.sql";
const ciPath=".github/workflows/ci.yml";
const migration=fs.readFileSync(migrationPath,"utf8");
const matchWindow=fs.readFileSync(matchWindowPath,"utf8");
const ci=fs.readFileSync(ciPath,"utf8");
const normalized=migration.replace(/\s+/g," ").toLowerCase();
const matchNormalized=matchWindow.replace(/\s+/g," ").toLowerCase();
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

for(const token of [
  "forecast_calendar_visible_core(date,integer)",
  "event_window as(",
  "min(estimated_date-tolerance_days)",
  "least(current_date,max(estimated_date+tolerance_days))",
  "cross join event_window w",
  "coalesce(t.effective_date,t.source_date) between w.min_date and w.max_date",
  "boundedactualmatchingwindow",
  "onetoonactualmatching"
])must(matchNormalized.includes(token.toLowerCase()),`Ventana física de matching incompleta: ${token}`);

must(!/\b(?:insert\s+into|update|delete\s+from)\s+financial_app\.transactions\b/i.test(matchWindow),"La optimización de matching no puede mutar movimientos bancarios");
must(matchWindow.includes("if v_next=v_def then raise exception 'forecast_match_window_event_window_patch_not_applied'"),"La migración debe fallar cerrada si no puede insertar event_window");
must(matchWindow.includes("if v_next=v_def then raise exception 'forecast_match_window_transaction_range_patch_not_applied'"),"La migración debe fallar cerrada si no puede acotar transaction_base");
must(matchWindow.includes("if v_next=v_def then raise exception 'forecast_match_window_rule_patch_not_applied'"),"La migración debe fallar cerrada si no puede registrar el contrato diagnóstico");
must(!matchNormalized.includes("tolerance_days:=")&&!matchNormalized.includes("tolerance_days ="),"La optimización no debe reescribir ni reducir tolerancias del forecast");
must(!matchNormalized.includes("identity_rank:=")&&!matchNormalized.includes("identity_rank ="),"La optimización no debe reescribir el ranking de identidad");
must(!matchNormalized.includes("amount_tolerance:="),"La optimización no debe alterar tolerancias de importe");
must(ci.includes("node scripts/forecast-obligation-performance-tests.mjs"),"Financial App CI no ejecuta el gate de rendimiento de obligaciones");

if(failures.length){
  console.error("Forecast obligation performance gate FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Forecast obligation performance gate OK · índices canónicos, ventana física de matching, privacidad, one-to-one y no-mutación protegidos");
