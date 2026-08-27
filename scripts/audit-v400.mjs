import{existsSync,readFileSync}from"node:fs";
const errors=[];
const must=(condition,message)=>{if(!condition)errors.push(message)};
const migration="database/FINANCIAL_APP_4.0.0_MOVEMENT_AUTOMATION.sql";
must(existsSync(migration),"falta la migración 4.0 de automatización");
if(existsSync(migration)){
  const sql=readFileSync(migration,"utf8");
  for(const token of [
    "financial_app.automation_runs",
    "enable row level security",
    "revoke all on table financial_app.automation_runs from public,anon,authenticated",
    "financial_app.automate_transactions_core",
    "financial_app.authorized_email()",
    "bulk_limit_exceeded",
    "apply_rule_to_transaction_internal",
    "order by priority asc,created_at asc,id asc",
    "score>=93",
    "amount_diff<=0.01",
    "score-second_score>=8",
    "transaction_id=any(v_ids)",
    "da.n=1",
    "db.n=1",
    "reconcile_pair_core",
    "'automation_exact',100",
    "financial_app_automate_transactions",
    "grant execute on function public.financial_app_automate_transactions(uuid[]) to authenticated,service_role",
    "revoke all on function financial_app.auto_link_documents_core() from public,anon,authenticated",
    "'app_version',to_jsonb('4.0.0'::text)"
  ])must(sql.includes(token),`contrato SQL 4.0 ausente: ${token}`);
  must(!sql.includes("grant execute on function financial_app.auto_link_documents_core() to authenticated"),"4.0 no debe exponer el autoenlace global a authenticated");
}
const route=readFileSync("app/api/movements/bulk/route.ts","utf8");
for(const token of ["AUTOMATION_OPERATION","automate-safe","$operation","financial_app_automate_transactions","MAX_BULK_MOVEMENTS = 200","unsupported_bulk_operation"])
  must(route.includes(token),`frontera bulk 4.0 incompleta: ${token}`);
must(route.indexOf("financial_app_automate_transactions")<route.indexOf("financial_app_bulk_update_transactions"),"la operación 4.0 debe interceptarse antes del patch genérico");
const editor=readFileSync("app/movimientos/bulk-movement-editor.tsx","utf8");
for(const token of ["Automatización 4.0","Automatizar seguro","Marcar revisados","$operation:\"automate-safe\"","nunca fuerza coincidencias ambiguas"])
  must(editor.includes(token),`interfaz 4.0 incompleta: ${token}`);
const version=readFileSync("lib/app-version.ts","utf8").match(/APP_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/)?.slice(1).map(Number);
must(Boolean(version)&&(version[0]>4||(version[0]===4&&version[1]>=0)),"APP_VERSION debe ser 4.0.0 o posterior");
const oldBoundary=readFileSync("database/FINANCIAL_APP_3.4.4_DOCUMENT_AUTOLINK_BOUNDARY.sql","utf8");
must(oldBoundary.includes("revoke execute on function financial_app.auto_link_documents_core() from public, anon, authenticated"),"se perdió la frontera histórica de autoenlace documental");
if(errors.length){console.error("Financial App 4.0 audit FAILED");errors.forEach(error=>console.error(`- ${error}`));process.exit(1)}
console.log("Financial App 4.0 audit OK · selección automatizada, reglas ordenadas, documentos seguros, conciliación 1↔1 y frontera privilegiada protegidas");
