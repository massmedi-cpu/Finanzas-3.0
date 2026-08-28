import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const migration=read("database/FINANCIAL_APP_6.4.6_DRIVE_RECONCILIATION.sql");
const pulse=read("lib/financial/home-pulse.ts");
const button=read("components/sync-button.tsx");
const home=read("app/page.tsx");

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
must(home.includes("<SyncButton reconciliationPending={pulse.driveSync.reconciliationPending}/>"),"Inicio no conecta el estado de reconciliación al botón");

if(failures.length){console.error("Financial App 6.4.6 Drive reconciliation audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.6 Drive reconciliation audit OK · cursor invalidado una vez y timestamp de sync coherente");
