import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const migration=read("database/FINANCIAL_APP_6.4.0_DOCUMENT_OPERATIONS.sql");
const permissions=read("database/FINANCIAL_APP_6.4.0_OPERATION_PERMISSIONS.sql");
const loader=read("lib/financial/document-operations.ts");
const api=read("app/api/archive/operations/route.ts");
const page=read("app/archivo/revision/page.tsx");
const client=read("app/archivo/revision/triage-client.tsx");
const quick=read("app/archivo/revision/triage-quick-resolution.tsx");
const css=read("app/archivo/revision/triage.css");
const workspaceCss=read("app/archivo/revision/triage-workspace.css");
const layout=read("app/archivo/revision/layout.tsx");
const lower=migration.toLowerCase();

for(const token of [
  "document_operations_core","document_operation_core","document_operations_batch_core","document_triage_core",
  "document_match_candidates_rows_core","auto_eligible","archive_link_calibrated_core","for update","document_history",
  "safe_match_no_longer_valid","archive_requires_linked_document","explicitApprovalRequired","serverRevalidationRequired",
  "ambiguousBatchActions","maxBatchSize",">50","security definer"
])must(migration.includes(token)||lower.includes(token.toLowerCase()),`Contrato operativo 6.4 incompleto: ${token}`);

must(!/grant\s+execute[^;]+\s+to\s+anon/i.test(`${migration}\n${permissions}`),"6.4 no puede conceder ejecución a anon");
for(const signature of ["financial_app.document_operations_core(integer)","financial_app.document_operation_core(uuid,text,text)","financial_app.document_operations_batch_core(jsonb)"]){
  must(migration.includes(`revoke all on function ${signature} from public,anon,authenticated,service_role`),`Instalación inicial sin revoke estricto: ${signature}`);
  must(permissions.includes(`grant execute on function ${signature} to authenticated`),`El wrapper invoker necesita core autenticado: ${signature}`);
  must(permissions.includes(`revoke all on function ${signature} from anon`),`Core 6.4 no puede quedar accesible a anon: ${signature}`);
}
for(const wrapper of ["financial_app_document_operations","financial_app_document_operation","financial_app_document_operations_batch"]){
  must(migration.includes(wrapper),`Falta wrapper público 6.4: ${wrapper}`);
  must(permissions.includes(`alter function public.${wrapper}`)&&permissions.includes("security invoker"),`Wrapper 6.4 debe quedar SECURITY INVOKER: ${wrapper}`);
}
must(migration.includes("exception when others"),"El lote debe aislar los rechazos por operación");
must(migration.includes("v_rejected:=v_rejected+1"),"El lote debe contabilizar operaciones rechazadas");

for(const token of ["DocumentSafeOperation","DocumentOperationDocument","DocumentOperations","parseDocumentOperations","financial_app_document_operations","getDocumentOperations"])
  must(loader.includes(token),`Loader 6.4 incompleto: ${token}`);
for(const token of ["financial_app_document_operations_batch","invalid_document_operations","operations.length>50"])
  must(api.includes(token),`API 6.4 incompleta: ${token}`);
for(const token of ["Bandeja de conciliación documental","getDocumentOperations","DocumentTriageClient","Conciliación de movimientos"])
  must(page.includes(token),`Página de conciliación incompleta: ${token}`);
for(const token of ["Seleccionar seguras","Aplicar ${selected.length","window.confirm","/api/archive/operations","servidor vuelve a validar","Deshacer ${lastApplied.length","?action=restore","method:\"DELETE\"","TriageQuickResolution","Bandeja de conciliación"])
  must(client.includes(token),`Cliente operativo 6.4 incompleto: ${token}`);
must(!client.includes('body:JSON.stringify({action:"archive"})'),"No puede reaparecer el archivado roto que enviaba action en el body");
must(client.includes("filter(document=>document.safeOperation)"),"La selección múltiple debe limitarse a operaciones marcadas seguras por servidor");
for(const token of ["method:\"PATCH\"","payload.ocrStatus=\"manual\"","/api/archive/operations","reconciled","Buscar movimiento compatible","window.confirm","onResolved(document.id","Guardar y validar OCR"])
  must(quick.includes(token),`Resolución end-to-end incompleta: ${token}`);
must(!quick.includes("/api/movements/")&&!quick.includes("method:\"DELETE\""),"La resolución rápida no puede modificar movimientos ni borrar documentos");
must(quick.includes("documentType")&&quick.includes("documentDate")&&quick.includes("amount")&&quick.includes("merchant"),"La resolución rápida debe cubrir los metadatos que alimentan matching");
for(const token of [".operations-summary",".operations-toolbar",".operation-check",".operation-safe-badge",".operation-safe-note","min-height:44px"])
  must(css.includes(token),`Estilos operativos 6.4 incompletos: ${token}`);
for(const token of [".triage-resolution",".triage-resolution-grid",".triage-resolution-actions","min-height:44px","@media(max-width:720px)"])
  must(workspaceCss.includes(token),`Workspace de conciliación incompleto: ${token}`);
must(layout.includes('import "./triage-workspace.css"'),"La bandeja debe cargar sus estilos responsive dedicados");

if(failures.length){console.error("Document operations v6.4 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Document operations v6.4 audit OK · selección explícita, lote seguro, revalidación server-side, reversibilidad y bandeja de conciliación end-to-end protegidas");
