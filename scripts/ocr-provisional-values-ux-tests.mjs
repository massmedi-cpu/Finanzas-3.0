import assert from "node:assert/strict";
import fs from "node:fs";

const client=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
const triage=fs.readFileSync("app/archivo/revision/triage-client.tsx","utf8");
const quick=fs.readFileSync("app/archivo/revision/triage-quick-resolution.tsx","utf8");

assert.ok(client.includes('function ocrValuesTrusted(status:string){return status==="complete"||status==="manual"||status==="not_required"}'),"Debe existir una única frontera visual de valores OCR confiables en Archivo");
assert.ok(client.includes('`${formatted} · provisional`'),"Las tarjetas deben marcar importes OCR no confiables como provisionales");
assert.ok(client.includes('detailOcrTrusted?"Importe":"Importe detectado"'),"El editor debe distinguir importe confirmado de importe detectado");
assert.ok(client.includes("pendiente de confirmar"),"El campo provisional debe indicar que requiere confirmación");
assert.ok(client.includes('detailOcrTrusted?"Total":"Importe detectado (provisional)"'),"La reconstrucción no puede etiquetar como Total un importe OCR pendiente");
assert.ok(client.includes("ocrAmountText(doc.amount,doc.ocrStatus)"),"La tarjeta debe usar la presentación de importe basada en confianza OCR");
assert.ok(!client.includes('<dt>Total</dt><dd>{formatMoney(detail.amount)}</dd>'),"No puede sobrevivir un Total incondicional para OCR pendiente");

assert.ok(triage.includes('const ocrValuesTrusted=(status:string|null)=>status==="complete"||status==="manual"||status==="not_required"'),"La bandeja debe compartir la misma frontera de confianza OCR");
assert.ok(triage.includes("Emisor detectado:"),"La cabecera de revisión debe identificar el emisor OCR como detectado cuando no está confirmado");
assert.ok(triage.includes("Fecha detectada:"),"La cabecera de revisión debe identificar la fecha OCR como detectada cuando no está confirmada");
assert.ok(triage.includes("· provisional"),"La cabecera de revisión debe marcar el importe OCR pendiente como provisional");
assert.ok(triage.includes("documentMetadataLine(document)"),"La cabecera debe pasar por una presentación basada en confianza OCR");
assert.ok(!triage.includes('{document.merchant||"Emisor sin identificar"} · {date(document.documentDate)} · {money(document.amount)}'),"La bandeja no puede presentar metadatos OCR pendientes como definitivos");

assert.ok(quick.includes("Datos OCR provisionales"),"El editor rápido debe avisar cuando los datos OCR siguen pendientes");
assert.ok(quick.includes('trustedOcr?"Fecha":"Fecha detectada"'),"La fecha del editor debe distinguir detectada de confirmada");
assert.ok(quick.includes('trustedOcr?"Importe":"Importe detectado"'),"El importe del editor debe distinguir detectado de confirmado");
assert.ok(quick.includes('trustedOcr?"Emisor / comercio":"Emisor / comercio detectado"'),"El emisor del editor debe distinguir detectado de confirmado");
assert.ok(quick.includes("Guardar y confirmar revisión"),"La acción que eleva confianza debe seguir siendo explícita");
assert.ok(quick.includes('status==="complete"||status==="manual"||status==="not_required"'),"Complete, manual y not_required deben conservar presentación confiable");

console.log("OCR provisional values UX tests OK · Archivo, Pendientes y bandeja distinguen metadatos detectados/provisionales de valores confirmados");
