import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const route=read("app/api/archive/[id]/route.ts");
for(const token of [
  'financial_app_archive_document',
  'Object.prototype.hasOwnProperty.call(input,key)',
  'has("documentDate")?input.documentDate:existing.documentDate',
  'has("amount")?input.amount:existing.amount',
  'has("merchant")?input.merchant:existing.merchant',
  'has("notes")?input.notes:existing.notes',
  'has("ocrText")?input.ocrText:existing.ocrText',
  'has("ocrData")?input.ocrData:existing.ocrData',
  'has("digitalReconstruction")?input.digitalReconstruction:existing.digitalReconstruction',
  'has("ocrStatus")?input.ocrStatus:existing.ocrStatus',
  '!Object.keys(input).length'
]) must(route.includes(token),`El PATCH parcial de Archivo ha perdido la garantía: ${token}`);

for(const forbidden of [
  'input.documentDate??null',
  'input.amount??null',
  'input.merchant??null',
  'input.notes??null'
]) must(!route.includes(forbidden),`El PATCH de Archivo vuelve a convertir campos omitidos en null: ${forbidden}`);

const migration=read("database/FINANCIAL_APP_3.8.1_ARCHIVE_PATCH.sql");
for(const token of ["'app_version'","'target_version'","'3.8.1'"])
  must(migration.includes(token),`La release 3.8.1 no registra su versión histórica: ${token}`);

if(failures.length){console.error("Financial App 3.8.1 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 3.8.1 audit OK · PATCH parcial conserva campos omitidos y permite null explícito donde el contrato DB lo admite");
