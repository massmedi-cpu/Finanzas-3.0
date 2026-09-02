import fs from "node:fs";

const file="database/FINANCIAL_APP_9.0.0_DOCUMENT_MATCHING_OCR_READINESS_GATE.sql";
const sql=fs.readFileSync(file,"utf8");
const lower=sql.toLowerCase();
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const gate="lower(coalesce(d.ocr_status,'')) not in ('pending','processing','needs_review','failed','error')";
must((lower.match(/create or replace function financial_app\.document_match_candidates_rows_core/g)||[]).length===1,
  "Debe reemplazarse exactamente una vez el core de candidatos detallados");
must((lower.match(/create or replace function financial_app\.document_has_match_candidate_core/g)||[]).length===1,
  "Debe reemplazarse exactamente una vez el core booleano de existencia");
must((lower.split(gate).length-1)===2,
  "El bloqueo OCR debe existir en los dos cores de matching");
must(!gate.includes("complete")&&!gate.includes("manual"),
  "Los estados complete/manual deben seguir siendo elegibles para matching");

for(const token of [
  "standard_tx as (","installment_tx as (","candidate_tx as (","union all",
  "standard_candidate as (","installment_candidate as (",
  "financial_app.transaction_match_date","abs(t.source_amount) between",
  "document_matching_active_policy_core","candidate_rank_raw","candidate_count_raw",
  "score_margin","auto_eligible","merchant_match","confidence_tier","reasons",
  "score>=policy.min_score","score-second_score>=policy.min_margin",
  "not policy.require_merchant_match or merchant_match",
  "revoke all on function financial_app.document_match_candidates_rows_core(uuid,integer)",
  "revoke all on function financial_app.document_has_match_candidate_core(uuid)"
])must(lower.includes(token.toLowerCase()),`El gate no puede perder el contrato existente: ${token}`);

must((lower.match(/join financial_app\.transactions t/g)||[]).length===4,
  "Deben conservarse dos rutas indexables en candidatos y dos en existencia");
must((lower.match(/abs\(t\.source_amount\) between/g)||[]).length===4,
  "Las cuatro rutas deben conservar el rango indexable por importe");

for(const forbidden of [
  "insert into financial_app.transaction_documents",
  "update financial_app.transactions",
  "delete from financial_app.transactions",
  "insert into financial_app.transactions",
  "update financial_app.documents",
  "delete from financial_app.documents",
  "create or replace function public.",
  "grant execute",
  "archive_document_payload_core",
  "archive_document_pending_reasons_core"
])must(!lower.includes(forbidden),`El gate OCR no debe parchear consumidores ni mutar datos: ${forbidden}`);

if(failures.length){
  console.error("Document matching OCR readiness audit FAILED");
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log("Document matching OCR readiness audit OK · pending/processing/needs_review/failed/error bloqueados en ambos cores; complete/manual preservan matching indexado y scoring canónico");
