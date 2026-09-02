import assert from "node:assert/strict";
import fs from "node:fs";
import { manualReviewMissingFields,manualReviewReady } from "../lib/document/ocr-review-completeness";

assert.deepEqual(manualReviewMissingFields("receipt",null,null),["documentDate","amount"],"Un ticket necesita fecha e importe antes de confirmarse manualmente");
assert.deepEqual(manualReviewMissingFields("invoice","2026-08-28","679,20"),[],"Una factura con fecha e importe finito puede confirmarse");
assert.equal(manualReviewReady("receipt","2026-08-29",0),true,"Un importe cero explícito sigue siendo un valor revisado, no un campo ausente");
assert.deepEqual(manualReviewMissingFields("receipt","2026-08-29","abc"),["amount"]);
assert.deepEqual(manualReviewMissingFields("receipt","",12.5),["documentDate"]);
assert.deepEqual(manualReviewMissingFields("contract",null,null),[],"No se puede imponer un importe artificial a contratos u otros documentos no financieros de venta");

const route=fs.readFileSync("app/api/archive/[id]/route.ts","utf8");
assert.ok(route.includes('apiError("manual_review_incomplete",422,{missingFields:guarded.manualReviewMissing})'),"La API debe rechazar la confirmación incompleta antes del RPC");
assert.ok(route.includes("manualReviewConfirmed&&manualReviewMissing.length===0"),"El estado manual solo puede elevarse si no falta ningún campo obligatorio");
assert.ok(route.indexOf("manual_review_incomplete")<route.indexOf('financial_app_archive_update'),"El rechazo debe ocurrir antes de cualquier escritura documental");

const client=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
assert.ok(client.includes('manualReviewMissingFields(edit.documentType,edit.documentDate,edit.amount)'),"Archivo debe calcular los mismos requisitos que el servidor");
assert.ok(client.includes('disabled={!canConfirmReview||isAction("review")'),"Confirmar revisión debe estar desactivado si faltan campos");
assert.ok(client.includes("Falta ${reviewMissingLabel(reviewMissingFields)}"),"El botón debe explicar qué falta");
assert.ok(client.includes("manual_review_incomplete"),"La UI debe traducir también el rechazo de servidor por si la validación cambia entre lectura y escritura");

console.log("OCR manual review completeness tests OK · receipt/invoice requieren fecha+importe; servidor bloquea antes de escribir y UI explica campos pendientes");
