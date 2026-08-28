import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const migrationPath="database/FINANCIAL_APP_6.1.0_EXPLAINABLE_DOCUMENT_MATCHING.sql";
must(fs.existsSync(migrationPath),"Falta la migración canónica de matching documental 6.1.0");
const migration=fs.existsSync(migrationPath)?read(migrationPath):"";
const archiveType=read("lib/financial/archive.ts");
const controlPage=read("app/control/page.tsx");
const panel=read("app/control/document-matching-panel.tsx");
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

// El autoenlace especial de Drive y las cuotas mantienen sus reglas deterministas;
// el bloque normal debe depender exclusivamente del candidato canónico.
const normalBlock=migration.split("with docs as (")[1]?.split("with docs as (")[0]||"";
must(normalBlock.includes("document_match_candidates_rows_core"),"El autoenlace normal no consume el motor canónico");
must(!normalBlock.includes("amount_score")&&!normalBlock.includes("merchant_score"),"El autoenlace normal ha recuperado una segunda fórmula de scoring");

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

for(const token of ["getArchiveOverview","DocumentMatchingPanel","archive.documents"])
  must(controlPage.includes(token),`Centro de control no integra observabilidad documental: ${token}`);
for(const token of [
  "Matching documental · explicable",
  "confidenceTier",
  "scoreMargin",
  "merchantMatch",
  "autoEligible",
  "candidate.reasons",
  "Cumple autoenlace seguro",
  "nunca se crea un vínculo",
]) must(panel.toLowerCase().includes(token.toLowerCase()),`Panel explicable incompleto: ${token}`);
for(const token of [".document-matching-panel{",".document-match-confidence{","font-size:14px","min-height:44px"])
  must(css.includes(token),`Estilos del matching explicable incompletos: ${token}`);

must(smoke.includes("version_from_headers()"),"El smoke debe normalizar la cabecera de versión antes de compararla");
must(!smoke.includes('\\r?$'),"El smoke no puede recuperar el regex CRLF que produjo un falso negativo en 6.0.1");

// La migración define funciones con INSERT internos, pero no debe ejecutarlas durante el DDL.
const outsideDefinition=migration.replace(/create or replace function[\s\S]*?\$function\$;/gi,"");
must(!outsideDefinition.includes("auto_link_documents_core()"),"La migración 6.1 no puede ejecutar autoenlaces al instalar el motor");

if(failures.length){
  console.error("Document matching v6.1 audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Document matching v6.1 audit OK · un único score, razones visibles, autoenlace normal canónico y motor interno no expuesto");
