import assert from "node:assert/strict";
import fs from "node:fs";

const config=fs.readFileSync("next.config.ts","utf8");
const client=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
const loader=fs.readFileSync("public/vendor/receipt-ocr-loader.mjs","utf8");
const legacy=fs.readFileSync("public/vendor/paddleocr-loader.mjs","utf8");

assert.ok(client.includes('script.src="/vendor/receipt-ocr-loader.mjs"'),"Archivo debe cargar el adaptador OCR canónico del mismo origen");
assert.ok(config.includes("source: '/vendor/receipt-ocr-loader.mjs'"),"El asset OCR actual necesita una política de caché dedicada");
assert.ok(config.includes("source: '/vendor/paddleocr-loader.mjs'"),"El shim legacy debe conservar no-store para pestañas antiguas");
assert.ok(config.includes("value: 'no-store, max-age=0'"),"El loader OCR no puede reutilizar una revisión anterior entre despliegues");
assert.ok(loader.includes("const MAX_SIDE = 3400"),"El loader actual debe conservar el techo de detalle validado para documentos densos");
assert.ok(loader.includes("const MIN_OCR_SHORT_SIDE = 1000"),"Las imágenes comprimidas deben recuperar una densidad mínima de caracteres antes de Tesseract");
assert.ok(loader.includes("const MAX_UPSCALE = 2"),"El reescalado de entradas pequeñas debe permanecer limitado para no disparar coste ni memoria");
assert.ok(loader.includes("__financialReceiptOCR"),"El loader actual debe exponer el adaptador genérico de OCR");
assert.ok(legacy.includes("/vendor/receipt-ocr-loader.mjs"),"El loader Paddle antiguo solo puede delegar al adaptador actual");

console.log("OCR loader cache policy tests OK · no-store, transporte 3400px y reescalado low-res limitado protegidos");
