import assert from "node:assert/strict";
import fs from "node:fs";

const config=fs.readFileSync("next.config.ts","utf8");
const client=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
const loader=fs.readFileSync("public/vendor/paddleocr-loader.mjs","utf8");

assert.ok(client.includes('script.src="/vendor/paddleocr-loader.mjs"'),"Archivo debe cargar el loader OCR canónico del mismo origen");
assert.ok(config.includes("source: '/vendor/paddleocr-loader.mjs'"),"El asset OCR necesita una política de caché dedicada");
assert.ok(config.includes("value: 'no-store, max-age=0'"),"El loader OCR no puede reutilizar una revisión anterior entre despliegues");
assert.ok(loader.includes("const MAX_SIDE = 3400"),"El loader actual debe conservar el techo de detalle validado para documentos densos");

console.log("OCR loader cache policy tests OK · asset operativo no-store y revisión de transporte actual protegidos");
