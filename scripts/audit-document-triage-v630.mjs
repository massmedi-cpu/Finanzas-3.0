import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const migration=read("database/FINANCIAL_APP_6.3.0_DOCUMENT_TRIAGE.sql");
const performanceMigration=read("database/FINANCIAL_APP_9.0.0_DOCUMENT_TRIAGE_MATCHING_SHORT_CIRCUIT.sql");
const loader=read("lib/financial/document-triage.ts");
const page=read("app/archivo/revision/page.tsx");
const client=read("app/archivo/revision/triage-client.tsx");
const layout=read("app/archivo/revision/layout.tsx");
const css=read("app/archivo/revision/triage.css");

for(const token of [
  "document_triage_core","financial_app_document_triage","review_ocr","complete_metadata","ready_to_link","review_match","investigate_no_match","archive_candidate",
  "document_matching_active_policy_core","pol.min_margin","readOnly","noAutomaticActions","usesCanonicalMatchingPolicy"
])must(migration.includes(token),`Contrato de triage incompleto: ${token}`);

must(!/score_margin,0\)\s*<\s*8/.test(migration),"El triage no puede hardcodear margen 8 fuera de la política activa");
for(const forbidden of [
  "insert into financial_app.transaction_documents","delete from financial_app.transaction_documents",
  "update financial_app.transactions","delete from financial_app.transactions","insert into financial_app.transactions",
  "update financial_app.documents","delete from financial_app.documents","insert into financial_app.documents",
  "update financial_app.accounts","delete from financial_app.accounts","insert into financial_app.accounts"
])must(!migration.toLowerCase().includes(forbidden),`La migración de triage debe ser de solo lectura: ${forbidden}`);

for(const token of ["DocumentTriageAction","DocumentTriage","parseDocumentTriage","financial_app_document_triage","getDocumentTriage"])
  must(loader.includes(token),`Loader de triage incompleto: ${token}`);
const triagePage=page.includes("Atención documental")&&page.includes("getDocumentTriage");
const operationsTitle=page.includes("Centro de operaciones documentales")||page.includes("Bandeja de conciliación documental");
const operationsPage=operationsTitle&&page.includes("getDocumentOperations");
must(triagePage||operationsPage,"La página debe conservar triage 6.3 directamente o a través del centro operativo forward-compatible");
must(page.includes("DocumentTriageClient"),"La página debe conservar el cliente canónico de revisión documental");
must(!page.includes("getDocumentMatchingObservability"),"La revisión no puede volver a depender de la cola matching-only de 6.1");
for(const token of ["Revisar OCR","Completar datos","Asociación segura","Investigar sin coincidencia"])
  must(client.includes(token),`Cliente de triage incompleto: ${token}`);
must(client.includes("Abrir en Archivo")||client.includes("Abrir ficha completa"),"Cliente de triage incompleto: acceso a la ficha documental completa");
const legacyArchiveLabel=client.includes("Archivar documento");
const operationsArchiveLabel=client.includes('archive_candidate:"Listo para archivar"')&&client.includes("data.operationSummary.archive");
must(legacyArchiveLabel||operationsArchiveLabel,"Cliente de triage incompleto: acción de archivado visible");
must(client.includes("El triage solo prioriza y explica")||client.includes("servidor vuelve a validar"),"La seguridad explícita del triage debe seguir visible");
must(client.includes("/api/archive/${documentId}/links"),"La asociación contextual calibrada debe conservarse");
must(client.includes('action:"archive"')||client.includes('/api/archive/operations'),"El archivado explícito debe conservar una ruta canónica");
must(!fs.existsSync("app/archivo/revision/review-client.tsx"),"No debe reaparecer el cliente matching-only sustituido por triage universal");
must(layout.includes('import "./triage.css";'),"La ruta de revisión debe cargar estilos de triage");
for(const token of [".triage-summary",".triage-review_ocr",".triage-complete_metadata",".triage-ready_to_link","min-height:44px"])
  must(css.includes(token),`Estilos de triage incompletos: ${token}`);

// 9.0.0: el motor de matching solo puede ejecutarse para documentos que hayan
// superado OCR, metadatos y vinculación. Esto evita repetir matching caro para
// estados que la máquina de triage resuelve antes, sin cambiar clasificación.
for(const token of [
  "candidate_docs as (",
  "d.ocr_status is distinct from 'failed'",
  "d.document_date is not null",
  "d.amount is not null",
  "d.merchant is not null",
  "btrim(d.merchant)<>''",
  "d.link_count=0",
  "from candidate_docs d",
  "when p.action in ('ready_to_link','review_match')",
  "then financial_app.document_match_candidates_json_core(p.id,3)",
  "else '[]'::jsonb",
  "financial_app.authorized_email()",
  "security definer"
])must(performanceMigration.toLowerCase().includes(token.toLowerCase()),`Optimización de triage 9.0.0 incompleta: ${token}`);
for(const action of ["review_ocr","complete_metadata","ready_to_link","review_match","investigate_no_match","archive_candidate"])
  must(performanceMigration.includes(action),`La optimización no puede perder el estado canónico ${action}`);
for(const forbidden of [
  "insert into financial_app.transaction_documents","delete from financial_app.transaction_documents",
  "update financial_app.transactions","delete from financial_app.transactions","insert into financial_app.transactions",
  "update financial_app.documents","delete from financial_app.documents","insert into financial_app.documents"
])must(!performanceMigration.toLowerCase().includes(forbidden),`La optimización de triage debe seguir siendo de solo lectura: ${forbidden}`);
must(!performanceMigration.includes("create or replace function public.financial_app_document_triage"),"La optimización no debe reabrir ni sustituir el wrapper público");
must(!/grant\s+execute/i.test(performanceMigration),"La optimización no debe ampliar permisos de ejecución");

if(failures.length){console.error("Document triage v6.3/9.0 performance audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Document triage audit OK · cola universal, política canónica, seguridad explícita y short-circuit de matching 9.0.0 protegidos");
