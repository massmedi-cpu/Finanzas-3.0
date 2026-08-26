import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
must(version.includes('APP_VERSION = "3.8.'),"La versión visible debe permanecer en la familia 3.8.x");

const bulkApi=read("app/api/movements/bulk/route.ts");
for(const token of ["MAX_BULK_MOVEMENTS = 200","financial_app_bulk_update_transactions","financial_app_undo_bulk_transaction_batch","no_transactions_selected","bulk_limit_exceeded","changed_since_apply"])
  must(bulkApi.includes(token),`El API masivo ha perdido la garantía: ${token}`);

const movements=read("app/movimientos/movements-client.tsx");
for(const token of ["BulkMovementEditor","selectedIds","MAX_BULK_MOVEMENTS=200","/api/movements/bulk","Seleccionar visibles","movement-card-row"])
  must(movements.includes(token),`Movimientos ha perdido la edición múltiple: ${token}`);

const bulkEditor=read("app/movimientos/bulk-movement-editor.tsx");
for(const token of ["No cambiar","Cambiar categoría","Cash Flow","Pendiente de revisar","Sustituir etiquetas","Máximo 200 movimientos por operación"])
  must(bulkEditor.includes(token),`El editor masivo ha perdido el control: ${token}`);

const undoButton=read("app/movimientos/bulk-undo-button.tsx");
for(const token of ["Deshacer última edición masiva","action:\"undo\"","changed_since_apply"])
  must(undoButton.includes(token),`El deshacer masivo ha perdido la garantía: ${token}`);

const syncButton=read("components/sync-button.tsx");
for(const token of ["AUTO_SYNC_INTERVAL = 15 * 60 * 1000","useEffect","financial-app-last-auto-sync","Actualizado con aviso"])
  must(syncButton.includes(token),`La sincronización automática ha perdido la garantía: ${token}`);

const sync=read("supabase/functions/financial-app-sync/index.ts");
for(const token of [
  'DRIVE_DOCUMENTS_ROOT_ID = "1HR64X9Tu2FuRD2cdyA6BGOIqfxZqtaIW"',
  'scope: "https://www.googleapis.com/auth/drive.readonly"',
  "financial_app_drive_sync_state",
  "financial_app_apply_drive_document_delta",
  "financial_app_finalize_document_links",
  "driveStartPageToken",
  "driveChanges",
  "driveDocumentDelta",
  "/drive/v3/changes",
  'includeRemoved: "true"',
  "DriveChangeTokenError",
  "fallbackFullScan",
  "financial_app_sync_metrics",
  "supportedDriveDocument"
]) must(sync.includes(token),`La sincronización Drive actual ha perdido la garantía: ${token}`);
must(!sync.includes("https://www.googleapis.com/auth/drive.file"),"Drive no puede adquirir permisos de escritura");
must(!sync.includes('scope: "https://www.googleapis.com/auth/drive"'),"Drive no puede usar el scope completo de escritura");

const bulkMigration=read("database/FINANCIAL_APP_3.8.0_BULK_DRIVE_SYNC.sql");
for(const token of [
  "bulk_update_transactions_rpc",
  "perform financial_app.update_transaction_rpc(v_id,p_patch)",
  "if v_count>200",
  "coalesce(auth.jwt()->>'role','')<>'service_role'",
  "revoke all on function financial_app.auto_link_documents_core() from public, anon, authenticated",
  "documents_storage_identity_uq"
]) must(bulkMigration.includes(token),`La migración base 3.8.0 ha perdido la garantía: ${token}`);

const undoMigration=read("database/FINANCIAL_APP_3.8.0_BATCH_UNDO.sql");
for(const token of [
  "transaction_bulk_batches",
  "transaction_bulk_batch_items",
  "for update",
  "before_patch",
  "after_updated_at",
  "bulk_batch_changed_since_apply",
  "undo_bulk_transaction_batch_rpc",
  "batchId"
]) must(undoMigration.includes(token),`El lote reversible 3.8.0 ha perdido la garantía: ${token}`);

const incrementalMigration=read("database/FINANCIAL_APP_3.8.1_DRIVE_INCREMENTAL_SYNC.sql");
for(const token of [
  "create table if not exists financial_app.drive_sync_state",
  "change_token text",
  "financial_app_drive_sync_state",
  "financial_app_apply_drive_document_delta",
  "p_removed_ids text[]",
  "p_next_token text",
  "p_full_scan boolean",
  "archived_at=coalesce(d.archived_at,now())",
  "archived_at=null",
  "grant execute on function public.financial_app_drive_sync_state() to service_role",
  "grant execute on function public.financial_app_apply_drive_document_delta(jsonb,text[],text,boolean) to service_role",
  "revoke all on table financial_app.drive_sync_state from public,anon,authenticated"
]) must(incrementalMigration.includes(token),`La migración incremental ha perdido la garantía: ${token}`);

const historyIndex=read("database/FINANCIAL_APP_3.8.1_BULK_HISTORY_INDEX.sql");
for(const token of ["transaction_bulk_batch_items_transaction_id_idx","transaction_bulk_batch_items(transaction_id)"])
  must(historyIndex.includes(token),`Falta el índice de cobertura del historial masivo: ${token}`);

const archivePage=read("app/archivo/page.tsx");
const reviewPage=read("app/archivo/revision/page.tsx");
const reviewClient=read("app/archivo/revision/review-client.tsx");
for(const token of ["/archivo/revision","Revisar asociaciones"])
  must(archivePage.includes(token),`Archivo ha perdido la entrada a revisión: ${token}`);
for(const token of ["Documentos por revisar","getArchiveReviewQueue"])
  must(reviewPage.includes(token),`La cola documental ha perdido la garantía: ${token}`);
for(const token of ["suggestions","Mejor coincidencia","/links","Abrir original"])
  must(reviewClient.includes(token),`La revisión documental ha perdido la acción: ${token}`);

if(failures.length){console.error("Financial App 3.8 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 3.8 audit OK · edición masiva reversible, historial indexado, Drive incremental read-only, revisión documental y límites protegidos");
