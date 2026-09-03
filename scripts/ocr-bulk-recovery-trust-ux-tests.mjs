import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("app/archivo/archive-bulk-ocr-recovery.tsx","utf8");
const deferred=fs.readFileSync("app/archivo/archive-bulk-ocr-recovery-deferred.tsx","utf8");
const lifecycle=fs.readFileSync("app/archivo/archive-lifecycle-client.tsx","utf8");
const route=fs.readFileSync("app/api/archive/reprocess-ocr/route.ts","utf8");
const page=fs.readFileSync("app/archivo/page.tsx","utf8");

for(const token of [
  "Actualización segura de OCR",
  "Comprobando OCR pendiente e histórico",
  "La actualización conserva el original, tus correcciones y sus asociaciones",
  "Se reutiliza el OCR existente cuando basta y solo se relee el original cuando hace falta",
  "Primero reutiliza el texto OCR existente con el parser actual",
  "continúan siendo provisionales",
  "solo un OCR validado o una revisión manual los confirma",
  "type RecoveryOutcome",
  "function outcomeFor",
  "Resultado por documento",
  "OCR validado",
  "Metadatos actualizados sin releer la imagen",
  "Sigue pendiente de revisión",
  "Omitido de forma segura",
  "No se pudo actualizar",
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
assert.ok(source.includes('if(response.mode==="metadata_reparse")'),"La UX debe distinguir reparseo de metadatos de una relectura visual completa");
assert.ok(source.includes('missingFieldDetail(response.missingFields)'),"Un OCR todavía pendiente debe indicar exactamente qué metadatos obligatorios faltan");
assert.ok(!source.includes("fecha, comercio e importe son correctos"),"Un OCR pendiente nunca puede presentarse como dato confirmado");
assert.ok(source.includes("Documentos procesados uno a uno"),"La UX debe comunicar que la recuperación sigue siendo secuencial");
assert.ok(source.includes("las asociaciones existentes"),"La UX debe dejar claro que actualizar un legacy no rompe sus asociaciones");

for(const token of [
  'reparseStoredReceiptMetadata',
  'RecoveryMode="metadata_reparse"|"full_ocr"',
  'const previewReparse=reparseStoredReceiptMetadata(initial,"preview")',
  'if(previewReparse?.fieldChanges.length)',
  'return respond(recoveryResponse(documentId,reparsed.persistence,reparsed.fieldChanges,"metadata_reparse"))',
  'return respond(recoveryResponse(documentId,persistence,fieldChanges,"full_ocr"))',
  'manualReviewMissingFields',
  'missingFields:manualReviewMissingFields(persistence.documentType,persistence.documentDate,persistence.amount)',
  'request.formData()',
  'NextResponse.redirect',
]) assert.ok(route.includes(token),`La API debe preferir reparseo seguro, aceptar fallback nativo y mantener revisión explícita: ${token}`);

assert.ok(route.indexOf('const previewReparse=reparseStoredReceiptMetadata(initial,"preview")')<route.indexOf('supabase.storage.from("financial-app-documents").download'),"El parser debe probarse antes de descargar/releer el original");
assert.ok(route.indexOf('const latest=await documentDetail(supabase,documentId)')<route.indexOf('const reparsed=reparseStoredReceiptMetadata(latest)'),"El reparseo debe releer estado antes de escribir para preservar cambios concurrentes");
assert.ok(route.includes('if(reparsed?.fieldChanges.length)'),"Un reparseo que no mejora metadatos debe caer al OCR completo en vez de bloquear recuperación");

assert.ok(page.includes('import {ArchiveBulkOcrRecoveryDeferred} from "./archive-bulk-ocr-recovery-deferred"'),"Archivo debe montar el recuperador seguro a través de un boundary diferido");
assert.ok(page.includes('<ArchiveBulkOcrRecoveryDeferred initialCount={pending} shouldCheck={true}/>'),"Archivo debe comprobar OCR pendiente y legacy aunque la vista actual no sea Pending");
assert.equal((page.match(/<ArchiveBulkOcrRecoveryDeferred/g)||[]).length,1,"Debe existir un único recuperador masivo para evitar estados duplicados");
assert.ok(page.indexOf('<ArchiveBulkOcrRecoveryDeferred initialCount={pending}')<page.indexOf('<ArchiveLifecycleClient'),"La recuperación segura debe conservar su posición lógica antes de la cola/listado documental");
assert.ok(!page.includes('from "./archive-bulk-ocr-recovery"'),"La seguridad OCR no requiere cargar el recuperador pesado en el camino inicial");
assert.ok(deferred.includes('import("./archive-bulk-ocr-recovery")'),"El boundary debe cargar exactamente el recuperador OCR seguro bajo demanda");
assert.ok(deferred.includes('requestIdleCallback'),"La recuperación debe prepararse automáticamente tras liberar el render inicial");
assert.ok(deferred.includes('Reintentar recuperación OCR'),"Un fallo de descarga del chunk debe ofrecer reintento sin tocar documentos");

assert.ok(lifecycle.includes('action="/api/archive/reprocess-ocr"')&&lifecycle.includes('method="post"'),"Los pendientes compatibles deben disponer de una recuperación nativa que funcione sin hidratar JavaScript");
assert.ok(lifecycle.includes('name="documentId"')&&lifecycle.includes('name="returnTo"'),"La recuperación nativa debe enviar solo el documento seleccionado y una vuelta segura a Archivo");
assert.ok(page.includes('OCR reprocesado desde el original')&&page.includes('La evidencia anterior permanece intacta'),"El resultado del fallback nativo debe explicar éxito o fallo sin fingir validación");

const loop=source.slice(source.indexOf("for(let index=0;index<selected.length;index++)"),source.indexOf("setOutcomes(nextOutcomes)"));
assert.ok(loop.includes("await fetch(\"/api/archive/reprocess-ocr\""),"El lote debe seguir esperando cada documento antes de avanzar");
assert.ok(!loop.includes("Promise.all"),"La mejora de UX no puede convertir la recuperación segura en paralelo");
assert.ok(loop.includes("failed+=1")&&loop.includes("continue"),"Un fallo individual debe seguir aislado del resto del lote");

console.log("OCR bulk recovery trust UX tests OK · parser almacenado primero, OCR completo solo si hace falta, lote secuencial, fallback nativo y confianza explícita");
