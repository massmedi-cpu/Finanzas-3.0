import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const migration=read("database/FINANCIAL_APP_6.4.6_DRIVE_RECONCILIATION.sql");
const pulse=read("lib/financial/home-pulse.ts");
const button=read("components/sync-button.tsx");
const home=read("app/page.tsx");
const sync=read("supabase/functions/financial-app-sync/index.ts");

for(const token of [
  "archive_v6_migration",
  "d.storage_provider='google_drive'",
  "set change_token=null",
  "where id='documents'",
  "drive_reconciliation_v646_checked",
  "'reconciliationPending',change_token is null",
  "'lastSyncAt',case when change_token is null then null else updated_at end",
  "'driveSync',v_drive_sync"
]) must(migration.includes(token),`Reconciliación Drive 6.4.6 incompleta: ${token}`);

must(!migration.includes("last_sync_at"),"6.4.6 no debe depender de la columna inexistente last_sync_at");
must(!migration.includes("update financial_app.documents\n      set archived_at=null"),"6.4.6 no debe desarchivar documentos en bloque");
must(!migration.includes("transaction_documents"),"6.4.6 no debe crear asociaciones documentales paralelas");
must(!migration.includes("auto_link_documents_core"),"6.4.6 no debe crear otro motor de matching");

for(const token of ["driveSync","reconciliationPending","lastSyncAt","lastMode"])
  must(pulse.includes(token),`Home pulse 6.4.6 no expone ${token}`);
for(const token of ["reconciliationPending","pendingReconciliation","Reconciliar Drive","reconciliationCompleted"])
  must(button.includes(token),`Botón de sync 6.4.6 incompleto: ${token}`);
must(home.includes("reconciliationPending={pulse.driveSync.reconciliationPending}"),"Inicio no conecta el estado de reconciliación al botón");

for(const token of [
  'const VERSION = 7',
  'ambiguousRemovals: number',
  'let ambiguousRemoval = false',
  'if (change?.removed || !file)',
  'ambiguousRemoval = true',
  'stats.ambiguousRemovals += 1',
  '!incremental.relevantFolderChanged && !incremental.ambiguousRemoval',
  'stats.fallbackFullScan = true',
  'const reconciliationPending = !String(documentState?.changeToken || "")',
  'const shouldFinalizeLinks = sourceChanged || documentChanged || reconciliationPending',
  'autoLinkSkipped = true',
]) must(sync.includes(token),`Sync Drive ha perdido la garantía conservadora: ${token}`);
must(sync.includes('const FILE_ID = "1OT4QFeRDAchLkznnQvmAe3SslDVXDm1JXU_kIGIhtV8"'),"La fuente financiera oficial de Drive no puede cambiar de ID accidentalmente");
must(sync.includes('const FILE_NAME = "Movimientos bancarios - fuente"'),"La sincronización debe validar también el nombre de la fuente financiera");
must(!sync.includes('1lcMy9FC3KgiKrOvCw6Ohbq0dx9VuDRpu'),"Financial App no puede apuntar al ZIP de Salud Conectada");

if(failures.length){console.error("Financial App Drive reconciliation audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App Drive reconciliation audit OK · cursor, borrados ambiguos, full scan conservador y autoenlace condicionado protegidos");
