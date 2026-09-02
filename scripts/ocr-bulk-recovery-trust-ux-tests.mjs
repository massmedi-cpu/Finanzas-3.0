import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("app/archivo/archive-bulk-ocr-recovery.tsx","utf8");
const route=fs.readFileSync("app/api/archive/reprocess-ocr/route.ts","utf8");
const page=fs.readFileSync("app/archivo/page.tsx","utf8");

for(const token of [
  "Los datos detectados todavía no están confirmados",
  "su fecha, comercio e importe deben tratarse como provisionales",
  "solo un OCR validado o una revisión manual confirma esos datos",
  "type RecoveryOutcome",
  "function outcomeFor",
  "Resultado por documento",
  "OCR validado",
  "Sigue pendiente de revisión",
  "Omitido de forma segura",
  "No se pudo releer",
  "La evidencia y los datos anteriores permanecen intactos",
  "humanFieldsPreserved",
  "Se han conservado tus correcciones",
  "missingFields",
  "Falta completar",
  "antes de confirmar la revisión",
]) assert.ok(source.includes(token),`La recuperación OCR debe explicar confianza y resultado por documento: ${token}`);

assert.ok(source.includes('setOutcomes([])'),"Cada nueva recuperación debe limpiar resultados anteriores");
assert.ok(source.includes('setOutcomes(nextOutcomes)'),"El resultado completo del lote debe publicarse de una sola vez al terminar");
assert.ok(source.includes('data-recovery-tone={outcome.tone}'),"Cada resultado debe conservar una semántica visual de estado sin depender del nombre del archivo");
assert.ok(source.includes('if(response.ocrStatus==="complete")'),"Solo complete puede etiquetarse como OCR validado automáticamente");
assert.ok(source.includes('missingFieldDetail(response.missingFields)'),"Un OCR todavía pendiente debe indicar exactamente qué metadatos obligatorios faltan");
assert.ok(!source.includes("fecha, comercio e importe son correctos"),"Un OCR pendiente nunca puede presentarse como dato confirmado");

for(const token of [
  'manualReviewMissingFields',
  'const missingFields=manualReviewMissingFields(persistence.documentType,persistence.documentDate,persistence.amount)',
  'fieldChanges,\n    missingFields,',
]) assert.ok(route.includes(token),`La API debe calcular los campos que aún impiden confirmar la revisión: ${token}`);
assert.ok(route.indexOf("const persistence=buildStoredReceiptPersistence")<route.indexOf("const missingFields=manualReviewMissingFields"),"Los campos pendientes deben calcularse sobre el resultado persistible nuevo, no sobre la lectura anterior");
assert.ok(route.indexOf("const latest=await documentDetail")<route.indexOf("const missingFields=manualReviewMissingFields"),"La comprobación de carrera sigue precediendo al resumen de revisión");

assert.ok(page.includes('import {ArchiveBulkOcrRecovery} from "./archive-bulk-ocr-recovery"'),"La vista Pending debe poder montar el recuperador OCR seguro");
assert.ok(page.includes('view==="pending"&&pending>0&&<ArchiveBulkOcrRecovery initialCount={0} shouldCheck={true}/>'),"Pendientes debe comprobar primero si hay OCR recuperables antes de forzar revisión manual");
assert.ok(page.indexOf('ArchiveBulkOcrRecovery initialCount={0}')<page.indexOf('<ArchiveLifecycleClient'),"La recuperación automática debe aparecer antes de la cola de revisión pendiente");

const loop=source.slice(source.indexOf("for(let index=0;index<selected.length;index++)"),source.indexOf("setOutcomes(nextOutcomes)"));
assert.ok(loop.includes("await fetch(\"/api/archive/reprocess-ocr\""),"El lote debe seguir esperando cada reprocesado antes de avanzar");
assert.ok(!loop.includes("Promise.all"),"La mejora de UX no puede convertir el reprocesado seguro en paralelo");
assert.ok(loop.includes("failed+=1")&&loop.includes("continue"),"Un fallo individual debe seguir aislado del resto del lote");

console.log("OCR bulk recovery trust UX tests OK · recuperación segura visible también en Pendientes, antes de la revisión manual, sin alterar seguridad secuencial ni confianza OCR");
