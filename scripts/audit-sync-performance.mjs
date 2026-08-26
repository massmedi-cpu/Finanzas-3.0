import { readFileSync } from "node:fs";

const errors=[];
const read=(path)=>readFileSync(path,"utf8");
const edge=read("supabase/functions/financial-app-sync/index.ts");
const migration=read("database/FINANCIAL_APP_3.8.1_SYNC_PERFORMANCE_OBSERVABILITY.sql");

const deferred="financial_app_import_drive_documents_deferred";
const finalize="financial_app_finalize_document_links";
const snapshot="applySnapshot(meta,items)";
const finalizeCall="finalizeDocumentLinks()";

if(!edge.includes(deferred)) errors.push("La Edge Function debe importar documentos con el RPC diferido");
if(!edge.includes(finalize)) errors.push("La Edge Function debe usar el RPC finalizador de asociaciones");
if(!edge.includes('financial_app_sync_metrics')) errors.push("La sincronización debe emitir métricas estructuradas por ejecución");
if(!edge.includes('runId=crypto.randomUUID()')) errors.push("Cada sincronización debe tener un runId correlacionable");
if(!edge.includes('Promise.all([driveMeta(token),sourceState()])')) errors.push("Meta de Drive y estado de fuente deben resolverse en paralelo");
for(const metric of ["driveScan","documentsApply","autoLink","listRequests","supportedDocuments"]){
  if(!edge.includes(metric)) errors.push(`Falta telemetría obligatoria de sync: ${metric}`);
}
const snapshotIndex=edge.indexOf(snapshot);
const finalizeIndex=edge.indexOf(finalizeCall);
if(snapshotIndex<0) errors.push("No se localiza la aplicación del snapshot bancario");
if(finalizeIndex<0) errors.push("No se localiza la finalización del autoenlace");
if(snapshotIndex>=0&&finalizeIndex>=0&&finalizeIndex<snapshotIndex) errors.push("El autoenlace no puede ejecutarse antes de aplicar los movimientos nuevos");

if(!migration.includes("jsonb_to_recordset(p_files)")) errors.push("La importación documental debe parsear el lote de forma set-based");
if(!migration.includes("on conflict (storage_provider,storage_path)")) errors.push("La importación documental debe hacer UPSERT set-based por identidad de Drive");
if(!migration.includes("transactions_document_match_idx")) errors.push("Debe existir el índice específico para matching documental");
if(!migration.includes("grant execute on function public.financial_app_import_drive_documents_deferred(jsonb) to service_role")) errors.push("El import diferido debe ser exclusivo de service_role");
if(!migration.includes("grant execute on function public.financial_app_finalize_document_links() to service_role")) errors.push("El finalizador debe ser exclusivo de service_role");
if(migration.includes("for v_item in select value from jsonb_array_elements(p_files) loop")) errors.push("No puede reaparecer el bucle SQL documento-a-documento");

if(errors.length){
  console.error("Financial App sync performance audit FAILED");
  for(const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Financial App sync performance audit OK · import set-based, orden documental→movimientos→autoenlace y telemetría protegidos");
