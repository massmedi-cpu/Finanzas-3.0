import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
must(version.includes('APP_VERSION = "3.8.0"'),"La versión visible debe ser 3.8.0");

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
  'const VERSION = 4',
  'DRIVE_DOCUMENTS_ROOT_ID = "1HR64X9Tu2FuRD2cdyA6BGOIqfxZqtaIW"',
  'scope:"https://www.googleapis.com/auth/drive.readonly"',
  "financial_app_import_drive_documents",
  "supportedDriveDocument",
  "driveDocuments(token)",
  "financial_app_drive_documents_error"
]) must(sync.includes(token),`La sincronización Drive ha perdido la garantía: ${token}`);
must(!sync.includes("https://www.googleapis.com/auth/drive.file"),"Drive no puede adquirir permisos de escritura");
must(!sync.includes("https://www.googleapis.com/auth/drive\""),"Drive no puede usar el scope completo de escritura");

const migration=read("database/FINANCIAL_APP_3.8.0_BULK_DRIVE_SYNC.sql");
for(const token of [
  "bulk_update_transactions_rpc",
  "perform financial_app.update_transaction_rpc(v_id,p_patch)",
  "if v_count>200",
  "financial_app_import_drive_documents",
  "import_drive_documents_core",
  "coalesce(auth.jwt()->>'role','')<>'service_role'",
  "revoke all on function public.financial_app_import_drive_documents(jsonb) from public, anon, authenticated",
  "grant execute on function public.financial_app_import_drive_documents(jsonb) to service_role",
  "revoke all on function financial_app.auto_link_documents_core() from public, anon, authenticated",
  "documents_storage_identity_uq"
]) must(migration.includes(token),`La migración 3.8.0 ha perdido la garantía: ${token}`);

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

const archivePage=read("app/archivo/page.tsx");
const reviewPage=read("app/archivo/revision/page.tsx");
const reviewClient=read("app/archivo/revision/review-client.tsx");
for(const token of ["/archivo/revision","Revisar asociaciones"])
  must(archivePage.includes(token),`Archivo ha perdido la entrada a revisión: ${token}`);
for(const token of ["Documentos por revisar","getArchiveReviewQueue"])
  must(reviewPage.includes(token),`La cola documental ha perdido la garantía: ${token}`);
for(const token of ["suggestions","Mejor coincidencia","/links","Abrir original"])
  must(reviewClient.includes(token),`La revisión documental ha perdido la acción: ${token}`);

if(failures.length){console.error("Financial App 3.8.0 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 3.8.0 audit OK · edición masiva reversible, Drive read-only, revisión documental, auto-sync y límites de seguridad protegidos");
