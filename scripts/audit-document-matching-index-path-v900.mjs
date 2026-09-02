import fs from "node:fs";

const file="database/FINANCIAL_APP_9.0.0_DOCUMENT_MATCHING_INDEX_PATH.sql";
const sql=fs.readFileSync(file,"utf8");
const lower=sql.toLowerCase();
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

for(const token of [
  "create or replace function financial_app.document_match_candidates_rows_core",
  "document_matching_active_policy_core",
  "standard_tx as (",
  "installment_tx as (",
  "candidate_tx as (",
  "union all",
  "p.match_mode='standard'",
  "p.match_mode='installment'",
  "financial_app.transaction_match_date",
  "abs(t.source_amount) between",
  "greatest(0::numeric,abs(p.target_amount)-greatest(3::numeric,abs(p.target_amount)*0.15))",
  "greatest(0::numeric,abs(p.target_amount)-greatest(0.50::numeric,abs(p.target_amount)*0.05))",
  "candidate_rank_raw",
  "candidate_count_raw",
  "score_margin",
  "auto_eligible",
  "merchant_match",
  "confidence_tier",
  "reasons",
  "security definer",
  "set search_path to 'pg_catalog','financial_app','auth'",
  "revoke all on function financial_app.document_match_candidates_rows_core(uuid,integer)"
])must(lower.includes(token.toLowerCase()),`Matching indexado 9.0.0 incompleto: ${token}`);

// El cuello de botella anterior era un único JOIN con OR sobre standard/installment,
// que impedía al planificador aprovechar transactions_document_match_idx.
must(!/join\s+tx\s+on\s*\(\(/i.test(sql),"El motor no puede recuperar el JOIN OR monolítico anterior");
must((lower.match(/join financial_app\.transactions t/g)||[]).length===2,"Debe existir una ruta física de transacciones por cada modo de matching");
must((lower.match(/abs\(t\.source_amount\) between/g)||[]).length===2,"Ambas rutas deben expresar importe como rango indexable");

// La optimización es solo de lectura y no puede crear una segunda fórmula o
// ampliar la superficie RPC.
for(const forbidden of [
  "insert into financial_app.transaction_documents",
  "update financial_app.transactions",
  "delete from financial_app.transactions",
  "insert into financial_app.transactions",
  "update financial_app.documents",
  "delete from financial_app.documents",
  "create or replace function public.",
  "grant execute"
])must(!lower.includes(forbidden),`La optimización de matching no puede contener: ${forbidden}`);

for(const token of [
  "then 60","then 48","then 38","else 20",
  "then 55","then 45","then 35",
  "then 25","then 22","then 18","else 10",
  "then 20 else 0",
  "score>=policy.min_score",
  "score-second_score>=policy.min_margin",
  "not policy.require_merchant_match or merchant_match",
  "when score>=75 then 'medium'",
  "else 'low'"
])must(lower.includes(token.toLowerCase()),`Scoring canónico perdido durante la optimización: ${token}`);

if(failures.length){
  console.error("Document matching index-path audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Document matching index-path audit OK · standard/installment separados, fecha+importe indexables, scoring/política intactos y cero mutación");
