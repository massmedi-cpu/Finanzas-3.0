import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("app/archivo/archive-bulk-ocr-recovery.tsx","utf8");
const deferred=fs.readFileSync("app/archivo/archive-bulk-ocr-recovery-deferred.tsx","utf8");
const route=fs.readFileSync("app/api/archive/reprocess-ocr/route.ts","utf8");
const page=fs.readFileSync("app/archivo/page.tsx","utf8");

for(const token of [
  "Actualización segura de OCR",
  "Comprobando OCR pendiente e histórico",
  "El reprocesado conserva el original, tus correcciones y sus asociaciones",
  "Puede incluir documentos pendientes y lecturas históricas realizadas con motores anteriores",
  "continúan siendo provisionales",
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
]) assert.ok(source.includes(token),`La recuperación OCR debe explicar confianza, alcance y resultado por documento: ${token}`);

assert.ok(source.includes('setOutcomes([])'),"Cada nueva recuperación debe limpiar resultados anteriores");
assert.ok(source.includes('setOutcomes(nextOutcomes)'),"El resultado completo del lote debe publicarse de una sola vez al terminar");
assert.ok(source.includes('data-recovery-tone={outcome.tone}'),"Cada resultado debe conservar una semántica visual de estado sin depender del nombre del archivo");
assert.ok(source.includes('if(response.ocrStatus==="complete")'),"Solo complete puede etiquetarse como OCR validado automáticamente");
assert.ok(source.includes('missingFieldDetail(response.missingFields)'),"Un OCR todavía pendiente debe indicar exactamente qué metadatos obligatorios faltan");
assert.ok(!source.includes("fecha, comercio e importe son correctos"),"Un OCR pendiente nunca puede presentarse como dato confirmado");
assert.ok(source.includes("Originales procesados uno a uno"),"La UX debe comunicar que la recuperación no paraleliza originales");
assert.ok(source.includes("las asociaciones existentes"),"La UX debe dejar claro que actualizar un legacy no rompe sus asociaciones");

for(const token of [
  'manualReviewMissingFields',
  'const missingFields=manualReviewMissingFields(persistence.documentType,persistence.documentDate,persistence.amount)',
  'fieldChanges,\n    missingFields,',
]) assert.ok(route.includes(token),`La API debe calcular los campos que aún impiden confirmar la revisión: ${token}`);
assert.ok(route.indexOf("const persistence=buildStoredReceiptPersistence")<route.indexOf("const missingFields=manualReviewMissingFields"),"Los campos pendientes deben calcularse sobre el resultado persistible nuevo, no sobre la lectura anterior");
assert.ok(route.indexOf("const latest=await documentDetail")<route.indexOf("const missingFields=manualReviewMissingFields"),"La comprobación de carrera sigue precediendo al resumen de revisión");

assert.ok(page.includes('import {ArchiveBulkOcrRecoveryDeferred} from "./archive-bulk-ocr-recovery-deferred"'),"Archivo debe montar el recuperador seguro a través de un boundary diferido");
assert.ok(page.includes('<ArchiveBulkOcrRecoveryDeferred initialCount={pending} shouldCheck={true}/>'),"Archivo debe comprobar OCR pendiente y legacy aunque la vista actual no sea Pending");
assert.equal((page.match(/<ArchiveBulkOcrRecoveryDeferred/g)||[]).length,1,"Debe existir una sola superficie de recuperación OCR para evitar estados duplicados");
assert.ok(page.indexOf('<ArchiveBulkOcrRecoveryDeferred initialCount={pending}')<page.indexOf('<ArchiveLifecycleClient'),"La recuperación segura debe conservar su posición lógica antes de la cola/listado documental");
assert.ok(!page.includes('from "./archive-bulk-ocr-recovery"'),"La seguridad OCR no requiere cargar el recuperador pesado en el camino inicial");
assert.ok(deferred.includes('import("./archive-bulk-ocr-recovery")'),"El boundary debe cargar exactamente el recuperador OCR seguro bajo demanda");
assert.ok(deferred.includes('requestIdleCallback'),"La recuperación debe prepararse automáticamente tras liberar el render inicial");
assert.ok(deferred.includes('Reintentar recuperación OCR'),"Un fallo de descarga del chunk debe ofrecer reintento sin tocar documentos");

const loop=source.slice(source.indexOf("for(let index=0;index<selected.length;index++)"),source.indexOf("setOutcomes(nextOutcomes)"));
assert.ok(loop.includes("await fetch(\"/api/archive/reprocess-ocr\""),"El lote debe seguir esperando cada reprocesado antes de avanzar");
assert.ok(!loop.includes("Promise.all"),"La mejora de UX no puede convertir el reprocesado seguro en paralelo");
assert.ok(loop.includes("failed+=1")&&loop.includes("continue"),"Un fallo individual debe seguir aislado del resto del lote");

console.log("OCR bulk recovery trust UX tests OK · recuperación única y diferida para pendientes/legacy · secuencial · asociaciones preservadas · confianza OCR explícita");
