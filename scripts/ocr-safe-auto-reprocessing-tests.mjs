import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("app/archivo/archive-client-core.tsx","utf8");

const upgradeStart=source.indexOf("async function upgradeExistingOcr");
const openStart=source.indexOf("async function openDocument",upgradeStart);
assert.ok(upgradeStart>=0&&openStart>upgradeStart,"Debe existir el flujo dedicado de actualización OCR antes de openDocument");
const upgrade=source.slice(upgradeStart,openStart);

assert.match(source,/function needsOcrUpgrade\(document:ArchiveDetail\)\{return Boolean\(document\.mimeType\?\.startsWith\("image\/"\)&&document\.ocrStatus!=="manual"&&!ocrMethod\(document\)\.startsWith\(RECEIPT_OCR_METHOD_PREFIX\)\);\}/,
  "Solo imágenes automáticas con método OCR legado pueden entrar en auto-upgrade; manual debe quedar excluido");
assert.match(upgrade,/if\(!force&&!needsOcrUpgrade\(document\)\)return;/,
  "La actualización automática debe respetar needsOcrUpgrade salvo reintento manual explícito");

const originalIndex=upgrade.indexOf("const original=await fetch(url");
const runIndex=upgrade.indexOf("const result=await runOcr(file");
const patchIndex=upgrade.indexOf("const patched=await fetch(`/api/archive/${document.id}`");
assert.ok(originalIndex>=0&&runIndex>originalIndex&&patchIndex>runIndex,
  "Debe descargar original y completar OCR antes de persistir cualquier PATCH");
assert.equal(upgrade.slice(0,runIndex).includes('method:"PATCH"'),false,
  "No puede existir una escritura del documento antes de que runOcr termine correctamente");
assert.match(upgrade,/ocrData:result\.data,digitalReconstruction:result\.reconstruction,ocrStatus:result\.status/,
  "El PATCH exitoso debe guardar juntas evidencia, reconstrucción y estado del nuevo OCR");
assert.match(upgrade,/catch\{setError\("El OCR no ha podido reconstruir el ticket en este intento\. El original y la revisión anterior se conservan sin cambios\."\);\}/,
  "El fallo de reanálisis debe conservar explícitamente original y revisión anterior");

const open=source.slice(openStart,source.indexOf("async function upload",openStart));
assert.match(open,/if\(body\.signedUrl&&needsOcrUpgrade\(body\.document\)\)await upgradeExistingOcr\(body\.document,body\.signedUrl\)/,
  "Abrir un documento legado solo debe auto-reprocesar si existe acceso al original privado");

console.log("OCR safe auto-reprocessing tests OK · manual excluido, original requerido, OCR termina antes del PATCH y fallos conservan revisión previa");
