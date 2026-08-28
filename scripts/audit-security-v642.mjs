import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const migration=read("database/FINANCIAL_APP_6.4.2_MATCHING_DASHBOARD_SECURITY.sql");
const lower=migration.toLowerCase();

for(const token of [
  "alter function public.financial_app_document_matching_dashboard(integer,integer) security invoker",
  "revoke all on function public.financial_app_document_matching_dashboard(integer,integer) from public,anon,authenticated,service_role",
  "grant execute on function public.financial_app_document_matching_dashboard(integer,integer) to authenticated,service_role",
  "revoke all on function financial_app.document_matching_dashboard_core(integer,integer) from public,anon,authenticated,service_role",
  "grant execute on function financial_app.document_matching_dashboard_core(integer,integer) to authenticated,service_role",
  "financial_app_6_4_2_anon_execute_forbidden",
  "financial_app_6_4_2_authenticated_chain_incomplete"
])must(lower.includes(token.toLowerCase()),`Contrato de seguridad 6.4.2 incompleto: ${token}`);

must(!/alter function public\.financial_app_document_matching_dashboard\(integer,integer\) security definer/i.test(migration),"El wrapper público no puede volver a SECURITY DEFINER");
must(!/grant execute on function public\.financial_app_document_matching_dashboard\(integer,integer\) to[^;]*anon/i.test(migration),"El wrapper no puede conceder EXECUTE a anon");
must(!/grant execute on function financial_app\.document_matching_dashboard_core\(integer,integer\) to[^;]*anon/i.test(migration),"El core no puede conceder EXECUTE a anon");

if(failures.length){console.error("Financial App 6.4.2 security audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.2 security audit OK · wrapper invoker, core privado autorizado y anon bloqueado");
