import { readFileSync } from "node:fs";

const errors=[];
const read=(path)=>readFileSync(path,"utf8");
const edge=read("supabase/functions/financial-app-sync/index.ts");
const performanceMigration=read("database/FINANCIAL_APP_3.8.1_SYNC_PERFORMANCE_OBSERVABILITY.sql");
const incrementalMigration=read("database/FINANCIAL_APP_3.8.1_DRIVE_INCREMENTAL_SYNC.sql");
const syncButton=read("components/sync-button.tsx");
const home=read("app/page.tsx");
const control=read("app/control/page.tsx");
const health=read("lib/financial/system-health.ts");

const requiredEdge=["financial_app_drive_sync_state","financial_app_apply_drive_document_delta","financial_app_finalize_document_links","/drive/v3/changes/startPageToken","/drive/v3/changes?","newStartPageToken","includeRemoved","DriveChangeTokenError","fallbackFullScan","financial_app_sync_metrics","crypto.randomUUID()","driveScan","documentsApply","autoLink","listRequests","supportedDocuments","removedDocuments"];
for(const token of requiredEdge){if(!edge.includes(token))errors.push(`Falta contrato incremental/telemetría de sync: ${token}`);}
if(!/Promise\.all\(\[driveMeta\(token\),\s*sourceState\(\),\s*driveSyncState\(\)\]\)/.test(edge))errors.push("Meta de Drive, fuente bancaria y estado incremental deben resolverse en paralelo");
if(!/driveDocumentDelta\(token,\s*String\(documentState\?\.changeToken\s*\|\|\s*""\),\s*driveStats\)/.test(edge))errors.push("El escaneo documental debe partir del changeToken persistido");
if(!edge.includes('const nextToken = await driveStartPageToken(token, stats);')||!edge.includes('const files = await driveDocumentsFull(token, stats);'))errors.push("Debe conservarse full scan seguro para inicialización/recuperación");
const snapshotIndex=edge.indexOf("sync = await applySnapshot(meta, items);");
const finalizeIndex=edge.indexOf("autoLink = await finalizeDocumentLinks();");
if(snapshotIndex<0)errors.push("No se localiza la aplicación del snapshot bancario");
if(finalizeIndex<0)errors.push("No se localiza la finalización del autoenlace");
if(snapshotIndex>=0&&finalizeIndex>=0&&finalizeIndex<snapshotIndex)errors.push("El autoenlace no puede ejecutarse antes de aplicar los movimientos nuevos");
if(!performanceMigration.includes("jsonb_to_recordset(p_files)"))errors.push("La importación documental base debe seguir siendo set-based");
if(!performanceMigration.includes("on conflict (storage_provider,storage_path)"))errors.push("El UPSERT base debe conservar identidad de Drive");
if(!performanceMigration.includes("transactions_document_match_idx"))errors.push("Debe existir el índice específico de matching documental");
if(performanceMigration.includes("for v_item in select value from jsonb_array_elements(p_files) loop"))errors.push("No puede reaparecer el bucle SQL documento-a-documento");
for(const token of ["create table if not exists financial_app.drive_sync_state","financial_app_drive_sync_state","financial_app_apply_drive_document_delta","p_removed_ids text[]","p_next_token text","archived_at=coalesce(d.archived_at,now())","change_token=coalesce(excluded.change_token","grant execute on function public.financial_app_drive_sync_state() to service_role","grant execute on function public.financial_app_apply_drive_document_delta(jsonb,text[],text,boolean) to service_role"]){if(!incrementalMigration.includes(token))errors.push(`Falta garantía SQL incremental: ${token}`);}
for(const token of ["AUTO_SYNC_COOLDOWN_MS=15*60*1000","AUTO_SYNC_STALE_MS=30*60*1000","financial-app-auto-sync-at","router.refresh()","autoSync"]){if(!syncButton.includes(token))errors.push(`Falta garantía de actualización inteligente: ${token}`);}
if(!home.includes("sourceModifiedAt={pulse.sync?.sourceModifiedAt}")||!home.includes("lastSyncAt={pulse.driveSync.lastSyncAt}")||!home.includes("autoSync"))errors.push("Inicio no entrega frescura real a la sincronización inteligente");
for(const token of ["financial_app_document_lifecycle_health","reconciliationPending","missingOriginals","orphanStorageObjects","duplicateLinks"]){if(!health.includes(token))errors.push(`Centro de estado incompleto: ${token}`);}
if(!control.includes("getSystemHealthSnapshot")||!control.includes("SystemHealthPanel"))errors.push("Centro de control no integra el estado operativo unificado");

if(errors.length){console.error("Financial App sync performance audit FAILED");for(const error of errors)console.error(`- ${error}`);process.exit(1);}
console.log("Financial App sync performance audit OK · incremental + auto refresh con cooldown + frescura y salud documental unificadas");
