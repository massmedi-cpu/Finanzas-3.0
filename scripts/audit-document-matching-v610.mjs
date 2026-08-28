import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const migrationPath="database/FINANCIAL_APP_6.1.0_EXPLAINABLE_DOCUMENT_MATCHING.sql";
const observabilityPath="database/FINANCIAL_APP_6.1.0_MATCHING_OBSERVABILITY.sql";
const historyPath="database/FINANCIAL_APP_6.1.0_MATCHING_QUALITY_HISTORY.sql";
for(const [file,label] of [[migrationPath,"matching documental"],[observabilityPath,"observabilidad documental"],[historyPath,"histórico agregado"]])
  must(fs.existsSync(file),`Falta la migración 6.1 de ${label}`);
const migration=fs.existsSync(migrationPath)?read(migrationPath):"";
const observability=fs.existsSync(observabilityPath)?read(observabilityPath):"";
const historyMigration=fs.existsSync(historyPath)?read(historyPath):"";
const archiveType=read("lib/financial/archive.ts");
const observabilityLoader=read("lib/financial/document-matching-observability.ts");
const dashboardLoader=read("lib/financial/document-matching-dashboard.ts");
const controlPage=read("app/control/page.tsx");
const panel=read("app/control/document-matching-panel.tsx");
const reviewPage=read("app/archivo/revision/page.tsx");
const reviewClient=read("app/archivo/revision/review-client.tsx");
const css=read("app/control/matching-quality.css");
const historyCss=read("app/control/document-matching-history.css");
const controlLayout=read("app/control/layout.tsx");
const smoke=read(".github/workflows/production-smoke.yml");

for(const token of [
  "document_match_candidates_rows_core",
  "document_match_candidates_json_core",
  "confidence_tier text",
  "score_margin numeric",
  "auto_eligible boolean",
  "'confidenceTier',c.confidence_tier",
  "'scoreMargin',c.score_margin",
  "'autoEligible',c.auto_eligible",
  "'reasons',c.reasons",
  "'suggestions',financial_app.document_match_candidates_json_core(d.id,5)",
  "cross join lateral financial_app.document_match_candidates_rows_core(d.id,2)",
  "c.candidate_rank=1",
  "c.auto_eligible",
]) must(migration.includes(token),`Matching canónico 6.1 incompleto: ${token}`);

must(!migration.includes("create or replace function public.financial_app_document_match"),"El motor de candidatos no puede exponerse como RPC público");
for(const token of [
  "revoke all on function financial_app.document_match_candidates_rows_core(uuid,integer) from public,anon,authenticated",
  "revoke all on function financial_app.document_match_candidates_json_core(uuid,integer) from public,anon,authenticated",
]) must(migration.includes(token),`El motor interno ha perdido su frontera de ejecución: ${token}`);

const normalBlock=migration.split("with docs as (")[1]?.split("with docs as (")[0]||"";
must(normalBlock.includes("document_match_candidates_rows_core"),"El autoenlace normal no consume el motor canónico");
must(!normalBlock.includes("amount_score")&&!normalBlock.includes("merchant_score"),"El autoenlace normal ha recuperado una segunda fórmula de scoring");

for(const token of [
  "document_matching_observability_core",
  "financial_app_document_matching_observability",
  "activeUnlinked","withCandidates","safeAuto","ambiguous","noCandidates","readOnlyObservability",
  "document_match_candidates_rows_core(d.id,2)","document_match_candidates_json_core(p.id,3)",
  "'documentType',p.document_type","'storageUrl',p.storage_url",
]) must(observability.includes(token),`Observabilidad matching 6.1 incompleta: ${token}`);
for(const forbidden of ["insert into financial_app.transaction_documents","update financial_app.documents","delete from financial_app.transaction_documents"])
  must(!observability.toLowerCase().includes(forbidden),`La observabilidad no puede mutar datos: ${forbidden}`);
must(observability.includes("grant execute on function public.financial_app_document_matching_observability(integer) to authenticated"),"El RPC de observabilidad debe ser solo authenticated");

for(const token of [
  "document_matching_quality_snapshots","document_matching_quality_history_core","document_matching_dashboard_core",
  "financial_app_document_matching_dashboard","Europe/Madrid","candidate_rate","safe_auto_rate","ambiguity_rate",
  "'storedNoFinancialValues',true","'observability',v_payload","document_matching_observability_core",
  "grant execute on function public.financial_app_document_matching_dashboard(integer,integer) to authenticated",
]) must(historyMigration.includes(token),`Histórico de calidad 6.1 incompleto: ${token}`);
const tableDefinition=historyMigration.match(/create table if not exists financial_app\.document_matching_quality_snapshots\(([\s\S]*?)\);/)?.[1]||"";
must(Boolean(tableDefinition),"No se puede auditar la tabla agregada de calidad");
for(const forbidden of ["document_id","transaction_id","amount","merchant","concept","counterparty","source_id","file_name"])
  must(!tableDefinition.includes(forbidden),`El histórico agregado no puede almacenar ${forbidden}`);
must((historyMigration.match(/document_matching_observability_core\(/g)||[]).length===1,"El dashboard debe calcular la observabilidad exactamente una vez por carga");
must(!historyMigration.includes("financial_app_document_matching_quality_history"),"No debe sobrevivir un segundo RPC público separado para histórico");

for(const token of [
  "confidenceTier?:ArchiveMatchConfidence","matchMode?:ArchiveMatchMode","amountDiff?:number|null","daysDiff?:number|null",
  "merchantMatch?:boolean","scoreMargin?:number|null","autoEligible?:boolean","reasons?:string[]",
]) must(archiveType.includes(token),`Tipado explicable incompleto: ${token}`);
must(!archiveType.includes("getArchiveReviewQueue")&&!archiveType.includes("archiveOverviewAllPages"),"Archivo no puede conservar el escaneo completo en Node para construir la cola de revisión");
for(const token of ["parseDocumentMatchingObservability","DocumentMatchingObservability","financial_app_document_matching_observability","readOnlyObservability","documentType:string","storageUrl:string|null"])
  must(observabilityLoader.includes(token),`Loader de observabilidad incompleto: ${token}`);
for(const token of ["DocumentMatchingDashboard","DocumentMatchingQualityPoint","financial_app_document_matching_dashboard","parseDocumentMatchingObservability","storedNoFinancialValues"])
  must(dashboardLoader.includes(token),`Dashboard de matching incompleto: ${token}`);

for(const token of ["getDocumentMatchingDashboard","DocumentMatchingPanel","documentMatchingDashboard"])
  must(controlPage.includes(token),`Centro de control no integra el dashboard documental único: ${token}`);
must(!controlPage.includes("getArchiveOverview")&&!controlPage.includes("getDocumentMatchingObservability("),"Centro de control no puede recalcular matching por una segunda vía");
for(const token of ["getDocumentMatchingObservability(20)","ArchiveReviewClient","data.summary.withCandidates"])
  must(reviewPage.includes(token),`Cola de revisión no consume la priorización server-side: ${token}`);
must(!reviewPage.includes("getArchiveReviewQueue"),"La revisión no puede volver al escaneo completo de Archivo");
for(const token of ["DocumentMatchingObservability","candidate.reasons","candidate.scoreMargin","document.storageUrl","priority-${document.priority}"])
  must(reviewClient.includes(token),`Revisión explicable incompleta: ${token}`);
for(const token of [
  "Matching documental · explicable","confidenceTier","scoreMargin","merchantMatch","autoEligible","candidate.reasons",
  "Cumple autoenlace seguro","Ambiguos","Los casos ambiguos nunca se consideran autoenlace seguro",
  "CALIDAD HISTÓRICA","candidateRate","safeAutoRate","ambiguityRate","storedNoFinancialValues","Histórico iniciado hoy",
]) must(panel.toLowerCase().includes(token.toLowerCase()),`Panel explicable/histórico incompleto: ${token}`);
for(const token of [".document-matching-panel{",".document-match-confidence{",".document-match-priority{","priority-ambiguous","font-size:14px","min-height:44px"])
  must(css.includes(token),`Estilos del matching explicable incompletos: ${token}`);
for(const token of [".document-matching-history{",".document-matching-history-grid{",".document-matching-history-row{","font-size:14px","min-height:44px"])
  must(historyCss.includes(token),`Estilos del histórico de matching incompletos: ${token}`);
must(controlLayout.includes('import "./document-matching-history.css";'),"Centro de control debe cargar la hoja propietaria del histórico de matching");

must(smoke.includes("version_from_headers()"),"El smoke debe normalizar la cabecera de versión antes de compararla");
must(!smoke.includes('\\r?$'),"El smoke no puede recuperar el regex CRLF que produjo un falso negativo en 6.0.1");

const outsideDefinition=migration.replace(/create or replace function[\s\S]*?\$function\$;/gi,"");
must(!outsideDefinition.includes("auto_link_documents_core()"),"La migración 6.1 no puede ejecutar autoenlaces al instalar el motor");

if(failures.length){
  console.error("Document matching v6.1 audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Document matching v6.1 audit OK · score único, cola server-side, histórico agregado sin datos financieros y una sola evaluación por dashboard");
