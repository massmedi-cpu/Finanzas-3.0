import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveOcrReviewStatus } from "../lib/document/ocr-review-transition";

const useful="TOTAL 12,50";
assert.equal(resolveOcrReviewStatus({existingStatus:"needs_review",incomingStatus:"manual",manualReviewConfirmed:true,newMachineEvidence:false,reviewSensitiveChanged:true,validationStatus:"failed",rawText:useful}),"manual","La revisión explícita puede elevar un OCR revisado a manual");
assert.equal(resolveOcrReviewStatus({existingStatus:"needs_review",incomingStatus:"manual",manualReviewConfirmed:false,newMachineEvidence:false,reviewSensitiveChanged:true,validationStatus:"failed",rawText:useful}),"needs_review","Pedir manual sin confirmación explícita no puede elevar confianza");
assert.equal(resolveOcrReviewStatus({existingStatus:"complete",incomingStatus:undefined,manualReviewConfirmed:false,newMachineEvidence:false,reviewSensitiveChanged:true,validationStatus:"complete",rawText:useful}),"needs_review","Editar metadatos sensibles de un OCR automático complete exige una nueva revisión");
assert.equal(resolveOcrReviewStatus({existingStatus:"needs_review",incomingStatus:undefined,manualReviewConfirmed:false,newMachineEvidence:false,reviewSensitiveChanged:true,validationStatus:"failed",rawText:useful}),null,"Guardar correcciones en un OCR pendiente conserva el estado hasta confirmar");
assert.equal(resolveOcrReviewStatus({existingStatus:"manual",incomingStatus:undefined,manualReviewConfirmed:false,newMachineEvidence:false,reviewSensitiveChanged:true,validationStatus:"failed",rawText:useful}),null,"Un documento ya revisado manualmente conserva esa confianza durante ediciones posteriores");
assert.equal(resolveOcrReviewStatus({existingStatus:"complete",incomingStatus:"complete",manualReviewConfirmed:false,newMachineEvidence:true,reviewSensitiveChanged:false,validationStatus:"failed",rawText:useful}),"needs_review","Nueva evidencia de máquina siempre vuelve a derivar el estado desde la validación real");
assert.equal(resolveOcrReviewStatus({existingStatus:"failed",incomingStatus:"failed",manualReviewConfirmed:false,newMachineEvidence:true,reviewSensitiveChanged:false,validationStatus:"failed",rawText:""}),"failed","Nueva evidencia sin texto útil sigue siendo un fallo OCR real");

const client=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
const route=fs.readFileSync("app/api/archive/[id]/route.ts","utf8");
assert.ok(client.includes('manualReviewConfirmed:true')&&client.includes('ocrStatus:"manual"'),"Archivo debe enviar una confirmación explícita al marcar manual");
assert.ok(client.includes("Confirmar revisión")&&client.includes("Guardar cambios"),"La UI debe separar guardar de confirmar revisión");
assert.ok(!client.includes('edit.ocrText!==(detail.ocrText||"")?"manual"'),"Editar texto OCR no puede volver a marcar manual implícitamente");
assert.ok(route.includes("delete next.manualReviewConfirmed")&&route.includes("resolveOcrReviewStatus"),"La marca de confirmación debe ser transitoria y validarse en servidor");
assert.ok(route.includes('reviewSensitiveChanged=["documentType","documentDate","amount","merchant","ocrText"]'),"Fecha, importe, comercio, tipo y texto deben formar la frontera de confianza manual");

console.log("OCR explicit review tests OK · guardar no eleva confianza, manual requiere confirmación y nuevas evidencias se revalidan");
