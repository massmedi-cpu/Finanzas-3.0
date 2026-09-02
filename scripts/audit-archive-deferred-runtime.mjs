import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const page=read("app/archivo/page.tsx");
const shell=read("app/archivo/archive-client-shell.tsx");
const core=read("app/archivo/archive-client.tsx");
const recoveryDeferred=read("app/archivo/archive-bulk-ocr-recovery-deferred.tsx");
const recovery=read("app/archivo/archive-bulk-ocr-recovery.tsx");

must(page.includes('from "./archive-client-shell"'),"Archivo debe conservar el boundary de biblioteca activa");
must(page.includes('from "./archive-bulk-ocr-recovery-deferred"'),"Archivo debe entrar por el boundary diferido de recuperación OCR");
must(!page.includes('from "./archive-bulk-ocr-recovery"'),"page.tsx no puede importar estáticamente el recuperador OCR pesado");
must(page.includes("<ArchiveBulkOcrRecoveryDeferred"),"Falta montar el recuperador OCR diferido");

for(const token of [
  'import("./archive-client")',
  'IntersectionObserver',
  'requestIdleCallback',
  'rootMargin:"240px 0px"',
  'globalThis.setTimeout(callback,70)',
  'loadingRef.current=null;setState("error")',
  'Cargar biblioteca ahora',
  'Reintentar biblioteca',
]) must(shell.includes(token),`Boundary diferido de biblioteca incompleto: ${token}`);
must(!shell.includes('import { ArchiveClient as ArchiveClientCore }'),"La biblioteca activa no puede recuperar un import runtime estático");

for(const token of [
  'import("./archive-bulk-ocr-recovery")',
  'requestIdleCallback',
  'globalThis.setTimeout(callback,60)',
  'loadingRef.current=null;setState("error")',
  'Reintentar recuperación OCR',
]) must(recoveryDeferred.includes(token),`Boundary diferido de recuperación OCR incompleto: ${token}`);
must(!recoveryDeferred.includes('import { ArchiveBulkOcrRecovery }'),"El boundary OCR no puede importar estáticamente el recuperador");

for(const token of [
  "async function runOcr",
  'import("@/lib/document/ticket-ocr")',
  'financial-app-documents',
  'manualReviewConfirmed:true',
  '<ArchiveMovementPicker',
  '<ReceiptGeometryPreview',
]) must(core.includes(token),`La carga diferida no puede eliminar contratos funcionales de Archivo: ${token}`);

for(const token of [
  'await fetch("/api/archive/reprocess-ocr"',
  'for(let index=0;index<selected.length;index++)',
  'humanFieldsPreserved',
]) must(recovery.includes(token),`La recuperación OCR diferida debe conservar su seguridad secuencial: ${token}`);

if(failures.length){
  console.error("Archive deferred runtime audit FAILED");
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log("Archive deferred runtime audit OK · biblioteca activa y recuperación OCR fuera del camino inicial · carga viewport/idle · retry protegido · contratos OCR/documentales intactos");
