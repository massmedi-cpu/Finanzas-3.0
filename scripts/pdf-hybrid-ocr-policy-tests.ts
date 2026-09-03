import assert from "node:assert/strict";
import fs from "node:fs";
import { isUsefulNativePdfText,isUsefulPdfOcrText,serverPdfSourceMode } from "../lib/document/server-pdf-text";

assert.equal(isUsefulNativePdfText("TOTAL 12,50"),false,"Un fragmento PDF corto no debe hacer pasar una página escaneada por texto completo");
assert.equal(isUsefulNativePdfText("FACTURA 2026 proveedor ejemplo base imponible 100,00 IVA 21,00 TOTAL 121,00"),true,"Texto nativo documental suficiente debe evitar OCR innecesario");
assert.equal(isUsefulPdfOcrText("TOTAL 12,50"),true,"Una lectura OCR corta pero significativa debe poder cubrir la página");
assert.equal(serverPdfSourceMode([1,2],[],[]),"pdf_text");
assert.equal(serverPdfSourceMode([],[1,2],[]),"pdf_ocr");
assert.equal(serverPdfSourceMode([1],[2],[]),"pdf_hybrid");
assert.equal(serverPdfSourceMode([1],[2],[3]),"pdf_incomplete","Una sola página sin cubrir invalida el estado completo");

const server=fs.readFileSync("lib/document/server-pdf-text.ts","utf8");
const drive=fs.readFileSync("lib/document/drive-content-hydration.ts","utf8");
const nextConfig=fs.readFileSync("next.config.ts","utf8");

for(const token of ["MAX_VISUAL_OCR_PAGES","page.getTextContent()","page.render(","recognizeServerReceiptImage","completeCoverage","nativePages","ocrPages","missingPages","serverPdfSourceMode"])
  assert.ok(server.includes(token),`Pipeline PDF híbrido incompleto: ${token}`);
const nativeRead=server.indexOf("const content=await page.getTextContent()");
const visualRead=server.indexOf("const recognized=await recognizeServerReceiptImage");
assert.ok(nativeRead>=0&&visualRead>nativeRead,"El PDF debe intentar texto nativo antes de gastar OCR visual");
assert.ok(server.includes('source:"missing"')&&server.includes('source:"ocr"')&&server.includes('source:"text"'),"Cada página debe conservar su procedencia");

for(const token of ["drive_auto_pdf_hybrid_tesseract_v2","drive_auto_pdf_ocr_tesseract_v2","drive_auto_pdf_incomplete_v2","completeCoverage","pageSources","validateReceiptFinancials"])
  assert.ok(drive.includes(token),`Persistencia Drive no protege el PDF híbrido: ${token}`);
assert.ok(drive.includes('meta.documentType!=="receipt"||validation?.status==="complete"'),"Un ticket PDF no puede declararse completo sin validación financiera");
assert.ok(nextConfig.includes("'/api/sync': [...ocrRuntimeAssets, ...pdfRenderRuntimeAssets]"),"Sync debe desplegar recursos de Tesseract y canvas PDF");
assert.ok(nextConfig.includes("@napi-rs/canvas-linux-x64-gnu"),"El canvas nativo de Vercel/Linux debe quedar trazado");

console.log("PDF hybrid OCR policy tests OK · cobertura por página, orden canónico, OCR visual selectivo y Drive conservador");