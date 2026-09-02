import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("app/archivo/archive-lifecycle-client.tsx","utf8");

for(const token of [
  'ArchivePendingReason',
  'ocr_needs_review:"Revisar OCR"',
  'movement_match_pending:"Revisar asociación"',
  'ocr_failed:"OCR sin lectura"',
  'ocr_error:"Error de OCR"',
  'function pendingReasonCopy',
  'document.pendingReasons.map',
  'Requiere: {pendingReasonCopy(document)}',
  'function ocrValuesTrusted',
  'function amountCopy',
  '`${value} · provisional`',
]) assert.ok(source.includes(token),`Pendientes debe explicar motivo real y confianza del importe: ${token}`);

assert.ok(source.includes('if(document.pendingReasons.includes("ocr_needs_review"))return"Revisar OCR"'),"El badge debe priorizar una revisión OCR explícita frente a Pendiente genérico");
assert.ok(source.includes('if(document.pendingReasons.includes("movement_match_pending"))return"Revisar asociación"'),"El badge debe distinguir una asociación pendiente de un OCR pendiente");
assert.ok(source.includes('if(document.amount==null)return"Importe pendiente"'),"Un documento sin importe debe seguir mostrándose como incompleto");
assert.ok(source.includes('ocrValuesTrusted(document.ocrStatus)?value:`${value} · provisional`'),"Un importe OCR sin validar no puede presentarse como definitivo");
assert.ok(!source.includes('<small>{document.amount==null?"Importe pendiente":formatEuro(document.amount)}'),"No puede sobrevivir el render histórico que mostraba importes OCR pendientes como definitivos");

console.log("Archive pending reasons trust tests OK · motivos canónicos visibles e importes OCR no confirmados marcados provisionales");
