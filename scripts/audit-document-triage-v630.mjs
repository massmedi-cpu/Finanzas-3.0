import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const migration=read("database/FINANCIAL_APP_6.3.0_DOCUMENT_TRIAGE.sql");
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
for(const token of ["Atención documental","getDocumentTriage","DocumentTriageClient"])
  must(page.includes(token),`Página de atención documental incompleta: ${token}`);
must(!page.includes("getDocumentMatchingObservability"),"La revisión no puede volver a depender de la cola matching-only de 6.1");
for(const token of ["Revisar OCR","Completar datos","Asociación segura","Investigar sin coincidencia","Archivar documento","El triage solo prioriza y explica"])
  must(client.includes(token),`Cliente de triage incompleto: ${token}`);
for(const token of ["/api/archive/${documentId}/links","action:\"archive\"","Abrir en Archivo"])
  must(client.includes(token),`Acción contextual de triage incompleta: ${token}`);
must(!fs.existsSync("app/archivo/revision/review-client.tsx"),"No debe reaparecer el cliente matching-only sustituido por triage universal");
must(layout.includes('import "./triage.css";'),"La ruta de revisión debe cargar estilos de triage");
for(const token of [".triage-summary",".triage-review_ocr",".triage-complete_metadata",".triage-ready_to_link","min-height:44px"])
  must(css.includes(token),`Estilos de triage incompletos: ${token}`);

if(failures.length){console.error("Document triage v6.3 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Document triage v6.3 audit OK · cola universal OCR/metadatos/matching/archivo, política canónica y cero acciones automáticas protegidas");
