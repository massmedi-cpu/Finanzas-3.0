import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const migration=read("database/FINANCIAL_APP_6.4.5_DRIVE_FILENAME_COMPAT.sql");
const release=read("database/FINANCIAL_APP_6.4.5_RELEASE.sql");

for(const token of [
  "create or replace function financial_app.drive_document_rows(p_files jsonb)",
  "20250826 Mercadona 23,49 €.pdf",
  "filename_date_parts",
  "filename_amount_parts",
  "compact_filename_merchant",
  "coalesce(compact_filename_merchant,source_merchant)",
  "revoke all on function financial_app.drive_document_rows(jsonb) from public,anon,authenticated,service_role"
]) must(migration.includes(token),`Contrato Drive 6.4.5 incompleto: ${token}`);

for(const token of [
  "financial_app_6_4_5_compact_drive_filename_regression",
  "date '2025-08-26'",
  "23.49::numeric",
  "'Mercadona'"
]) must(release.includes(token),`Regresión ejecutable 6.4.5 incompleta: ${token}`);

must(!migration.includes("auto_link_documents_core"),"La compatibilidad de nombres no debe crear ni modificar un motor de matching");
must(!migration.includes("transaction_documents"),"La normalización de ingesta no debe escribir asociaciones documentales");
must(!migration.includes("update financial_app.transactions"),"La migración de nombres no debe mutar movimientos financieros");

if(failures.length){console.error("Financial App 6.4.5 Drive filename audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.5 Drive filename audit OK · nombre compacto normalizado antes del matching 6.x");
