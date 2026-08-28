import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const migrationPath="database/FINANCIAL_APP_6.1.0_EXPLAINABLE_DOCUMENT_MATCHING.sql";
const observabilityPath="database/FINANCIAL_APP_6.1.0_MATCHING_OBSERVABILITY.sql";
must(fs.existsSync(migrationPath),"Falta la migración canónica de matching documental 6.1.0");
must(fs.existsSync(observabilityPath),"Falta la migración de observabilidad documental 6.1.0");
const migration=fs.existsSync(migrationPath)?read(migrationPath):"";
const observability=fs.existsSync(observabilityPath)?read(observabilityPath):"";
const archiveType=read("lib/financial/archive.ts");
const observabilityLoader=read("lib/financial/document-matching-observability.ts");
const controlPage=read("app/control/page.tsx");
const panel=read("app/control/document-matching-panel.tsx");
const reviewPage=read("app/archivo/revision/page.tsx");
const reviewClient=read("app/archivo/revision/review-client.tsx");
const css=read("app/control/matching-quality.css");
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
  "activeUnlinked",
  "withCandidates",
  "safeAuto",
  "ambiguous",
  "noCandidates",
  "readOnlyObservability",
  "document_match_candidates_rows_core(d.id,2)",
  "document_match_candidates_json_core(p.id,3)",
  "'documentType',p.document_type",
  "'storageUrl',p.storage_url",
]) must(observability.includes(token),`Observabilidad matching 6.1 incompleta: ${token}`);
for(const forbidden of ["insert into financial_app.transaction_documents","update financial_app.documents","delete from financial_app.transaction_documents"])
  must(!observability.toLowerCase().includes(forbidden),`La observabilidad no puede mutar datos: ${forbidden}`);
must(observability.includes("grant execute on function public.financial_app_document_matching_observability(integer) to authenticated"),"El RPC de observabilidad debe ser solo authenticated");

for(const token of [
  "confidenceTier?:ArchiveMatchConfidence",
  "matchMode?:ArchiveMatchMode",
  "amountDiff?:number|null",
  "daysDiff?:number|null",
  "merchantMatch?:boolean",
  "scoreMargin?:number|null",
  "autoEligible?:boolean",
  "reasons?:string[]",
]) must(archiveType.includes(token),`Tipado explicable incompleto: ${token}`);
must(!archiveType.includes("getArchiveReviewQueue")&&!archiveType.includes("archiveOverviewAllPages"),"Archivo no puede conservar el escaneo completo en Node para construir la cola de revisión");
for(const token of ["DocumentMatchingObservability","activeUnlinked","ambiguous","financial_app_document_matching_observability","readOnlyObservability","documentType:string","storageUrl:string|null"])
  must(observabilityLoader.includes(token),`Loader de observabilidad incompleto: ${token}`);

for(const token of ["getDocumentMatchingObservability","DocumentMatchingPanel","documentMatching"])
  must(controlPage.includes(token),`Centro de control no integra observabilidad documental server-side: ${token}`);
must(!controlPage.includes("getArchiveOverview"),"Centro de control no puede volver a inferir matching desde una página parcial de Archivo");
for(const token of ["getDocumentMatchingObservability(20)","ArchiveReviewClient","data.summary.withCandidates"])
  must(reviewPage.includes(token),`Cola de revisión no consume la priorización server-side: ${token}`);
must(!reviewPage.includes("getArchiveReviewQueue"),"La revisión no puede volver al escaneo completo de Archivo");
for(const token of ["DocumentMatchingObservability","candidate.reasons","candidate.scoreMargin","document.storageUrl","priority-${document.priority}"])
  must(reviewClient.includes(token),`Revisión explicable incompleta: ${token}`);
for(const token of [
  "Matching documental · explicable",
  "confidenceTier",
  "scoreMargin",
  "merchantMatch",
  "autoEligible",
  "candidate.reasons",
  "Cumple autoenlace seguro",
  "Ambiguos",
  "Los casos ambiguos nunca se consideran autoenlace seguro",
]) must(panel.toLowerCase().includes(token.toLowerCase()),`Panel explicable incompleto: ${token}`);
for(const token of [".document-matching-panel{",".document-match-confidence{",".document-match-priority{","priority-ambiguous","font-size:14px","min-height:44px"])
  must(css.includes(token),`Estilos del matching explicable incompletos: ${token}`);

must(smoke.includes("version_from_headers()"),"El smoke debe normalizar la cabecera de versión antes de compararla");
must(!smoke.includes('\\r?$'),"El smoke no puede recuperar el regex CRLF que produjo un falso negativo en 6.0.1");

const outsideDefinition=migration.replace(/create or replace function[\s\S]*?\$function\$;/gi,"");
must(!outsideDefinition.includes("auto_link_documents_core()"),"La migración 6.1 no puede ejecutar autoenlaces al instalar el motor");

if(failures.length){
  console.error("Document matching v6.1 audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Document matching v6.1 audit OK · score único, ambigüedad explícita, cola server-side de solo lectura y autoenlace conservador");
