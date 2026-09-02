import assert from "node:assert/strict";
import fs from "node:fs";

const client=fs.readFileSync("app/archivo/archive-client-core.tsx","utf8");

assert.ok(client.includes('function ocrValuesTrusted(status:string){return status==="complete"||status==="manual"||status==="not_required"}'),"Debe existir una única frontera visual de valores OCR confiables");
assert.ok(client.includes('`${formatted} · provisional`'),"Las tarjetas deben marcar importes OCR no confiables como provisionales");
assert.ok(client.includes('detailOcrTrusted?"Importe":"Importe detectado"'),"El editor debe distinguir importe confirmado de importe detectado");
assert.ok(client.includes("pendiente de confirmar"),"El campo provisional debe indicar que requiere confirmación");
assert.ok(client.includes('detailOcrTrusted?"Total":"Importe detectado (provisional)"'),"La reconstrucción no puede etiquetar como Total un importe OCR pendiente");
assert.ok(client.includes("ocrAmountText(doc.amount,doc.ocrStatus)"),"La tarjeta debe usar la presentación de importe basada en confianza OCR");
assert.ok(!client.includes('<dt>Total</dt><dd>{formatMoney(detail.amount)}</dd>'),"No puede sobrevivir un Total incondicional para OCR pendiente");

console.log("OCR provisional values UX tests OK · importes pendientes se muestran como detectados/provisionales y complete/manual conservan Total");
