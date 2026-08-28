import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const policy=read("database/FINANCIAL_APP_6.2.0_SUPERVISED_MATCHING_POLICY.sql");
const activation=read("database/FINANCIAL_APP_6.2.0_POLICY_DRIVEN_MATCHING.sql");
const loader=read("lib/financial/document-matching-policy.ts");
const panel=read("app/control/document-matching-policy-panel.tsx");
const api=read("app/api/control/document-matching-policy/route.ts");
const page=read("app/control/page.tsx");
const layout=read("app/control/layout.tsx");

for(const token of [
  "document_matching_policies","document_matching_policy_proposals","document_matching_active_policy_core",
  "document_matching_policy_recommendation_core","document_matching_policy_generate_core","document_matching_policy_apply_core",
  "document_matching_policy_reject_core","document_matching_policy_rollback_core","requiresExplicitApproval","neverRelaxesAutomatically"
])must(policy.includes(token),`Política supervisada incompleta: ${token}`);

for(const token of ["min_score","min_margin","require_merchant_match","document_matching_active_policy_core()","score>=policy.min_score","score-second_score>=policy.min_margin","not policy.require_merchant_match or merchant_match"])
  must(activation.includes(token),`Motor 6.2 no consume la política activa: ${token}`);
must(!/score\s*>=\s*93/.test(activation),"El criterio autoelegible no puede volver a hardcodear score 93");
must(!/score-second_score\s*>=\s*8/.test(activation),"El criterio autoelegible no puede volver a hardcodear margen 8");
for(const forbidden of ["insert into financial_app.transaction_documents","delete from financial_app.transaction_documents","update financial_app.transactions","update financial_app.documents"])
  must(!activation.toLowerCase().includes(forbidden),`La activación 6.2 no puede mutar datos durante la migración: ${forbidden}`);

for(const token of ["MatchingPolicyDashboard","financial_app_document_matching_policy_dashboard","getDocumentMatchingPolicyDashboard"])
  must(loader.includes(token),`Loader de política incompleto: ${token}`);
for(const token of ["El motor propone; tú decides","Generar propuesta","Aplicar política","Rechazar","Volver a la política anterior"])
  must(panel.toLowerCase().includes(token.toLowerCase()),`Panel supervisado incompleto: ${token}`);
for(const token of ["financial_app_document_matching_policy_generate","financial_app_document_matching_policy_apply","financial_app_document_matching_policy_reject","financial_app_document_matching_policy_rollback"])
  must(api.includes(token),`API supervisada incompleta: ${token}`);
must(page.includes("DocumentMatchingPolicyPanel")&&page.includes("getDocumentMatchingPolicyDashboard"),"Centro de control no integra la política supervisada");
must(layout.includes('import "./document-matching-policy.css";'),"Centro de control no carga estilos 6.2");

for(const token of [
  "revoke all on table financial_app.document_matching_policies from public,anon,authenticated",
  "revoke all on table financial_app.document_matching_policy_proposals from public,anon,authenticated",
  "grant execute on function public.financial_app_document_matching_policy_dashboard(integer) to authenticated",
  "revoke all on function public.financial_app_document_matching_policy_apply(bigint) from public,anon"
])must(policy.includes(token),`Frontera de seguridad 6.2 incompleta: ${token}`);

const outsideFunctions=policy.replace(/create or replace function[\s\S]*?\$function\$;/gi,"");
must(!outsideFunctions.includes("document_matching_policy_apply_core(")&&!outsideFunctions.includes("document_matching_policy_rollback_core("),"La instalación 6.2 no puede aplicar ni revertir políticas automáticamente");

if(failures.length){console.error("Supervised matching v6.2 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Supervised matching v6.2 audit OK · política versionada, aprobación explícita, rollback y motor gobernado sin autoajuste opaco");
