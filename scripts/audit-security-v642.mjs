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

const boundary=read("database/FINANCIAL_APP_9.0.0_RPC_ACCESS_BOUNDARY_HARDENING.sql");
const boundaryLower=boundary.toLowerCase();

for(const token of [
  "alter view public.financial_app_access set (security_invoker = true)",
  "revoke all on table public.financial_app_access from public, anon, authenticated",
  "grant select on table public.financial_app_access to authenticated",
  "create or replace function financial_app.require_authorized_access()",
  "raise exception 'financial_app_access_denied'",
  "revoke all on function financial_app.require_authorized_access() from public, anon, authenticated, service_role",
  "grant execute on function financial_app.require_authorized_access() to authenticated, service_role",
  "financial_app_rpc_boundary_access_view_must_be_security_invoker",
  "financial_app_rpc_boundary_allowed_users_rls_required",
  "financial_app_rpc_boundary_public_wrapper_invalid",
  "financial_app_rpc_boundary_private_core_invalid"
])must(boundaryLower.includes(token.toLowerCase()),`Frontera RPC 9.0.0 incompleta: ${token}`);

const protectedWrappers=[
  "financial_app_archive_link_calibrated",
  "financial_app_archive_unlink_calibrated",
  "financial_app_document_matching_calibration",
  "financial_app_document_matching_observability",
  "financial_app_document_matching_policy_apply",
  "financial_app_document_matching_policy_dashboard",
  "financial_app_document_matching_policy_generate",
  "financial_app_document_matching_policy_reject",
  "financial_app_document_matching_policy_rollback"
];

for(const name of protectedWrappers){
  const start=boundaryLower.indexOf(`create or replace function public.${name}`);
  must(start>=0,`Falta wrapper protegido ${name}`);
  if(start<0)continue;
  const next=boundaryLower.indexOf("create or replace function public.",start+1);
  const block=boundaryLower.slice(start,next>=0?next:boundaryLower.indexOf("revoke all on function public.",start));
  must(block.includes("security invoker"),`${name} debe permanecer SECURITY INVOKER`);
  must(block.includes("financial_app.require_authorized_access()"),`${name} debe exigir allowlist antes del core`);
  must(!block.includes("security definer"),`${name} no puede volver a SECURITY DEFINER`);
}

must(!/grant execute on function public\.financial_app_(?:archive_(?:link|unlink)_calibrated|document_matching_(?:calibration|observability|policy_(?:apply|dashboard|generate|reject|rollback)))[^;]*\bto\b[^;]*anon/i.test(boundary),"Ningún RPC protegido puede conceder EXECUTE a anon");
must(!/grant\s+(?:insert|update|delete|truncate|all)[^;]*public\.financial_app_access[^;]*authenticated/i.test(boundary),"authenticated no puede recuperar permisos de escritura sobre la allowlist pública");

if(failures.length){console.error("Financial App security audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App security audit OK · wrappers invoker, allowlist privada, guard RPC y anon bloqueado");
