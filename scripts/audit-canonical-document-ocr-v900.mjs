import fs from "node:fs";

const read=(file)=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const canonical=read("lib/document/server-canonical-receipt.ts");
const archive=read("lib/document/server-archive-ocr-reprocess.ts");
const drive=read("lib/document/drive-content-hydration.ts");
const engine=read("lib/document/ticket-ocr-engine.ts");
const provenance=read("lib/document/receipt-ocr-provenance.ts");

for(const token of [
  "recognizeServerReceiptImage",
  "recognizeTicketImage",
  "receiptOcrRuntime",
  "server_ocr_runtime_mismatch",
  "options.hint ?? \"receipt\"",
]) must(canonical.includes(token),`Pipeline OCR canónico incompleto: ${token}`);

must((canonical.match(/recognizeServerReceiptImage\(/g)||[]).length===1,"El pipeline canónico debe ejecutar una sola lectura Tesseract por inferencia");
must((canonical.match(/recognizeTicketImage\(/g)||[]).length===1,"El pipeline canónico debe ejecutar una sola pasada de parser/validación");
must(archive.includes('from "./server-canonical-receipt"')&&archive.includes("recognizeCanonicalReceiptBytes"),"El reprocesado de Archivo no usa el OCR canónico de servidor");
must(!archive.includes('from "./server-receipt-ocr"')&&!archive.includes("recognizeServerReceiptImage("),"El reprocesado de Archivo mantiene un motor Tesseract paralelo");

for(const token of [
  'from "./server-canonical-receipt"',
  "recognizeCanonicalReceiptBytes",
  "financiallyValid=parsed.validation?.status===\"complete\"",
  "method:parsed.method",
  'sourceMethod:"drive_auto_image_canonical_v2"',
  "rawText:parsed.rawText",
  "normalizedText:parsed.normalizedText",
  "validation:parsed.validation",
  "receiptLayout:parsed.receiptLayout",
  "geometryLayout:Boolean(visualLayout||parsed.receiptLayout)",
]) must(drive.includes(token),`Drive no conserva paridad OCR canónica: ${token}`);

must(!drive.includes("recognizeServerReceiptImage("),"Drive no puede saltarse el parser y la validación canónicos llamando Tesseract directamente");
must(!drive.includes("drive_auto_image_tesseract_v1"),"Sobrevive el método Drive v1 que evitaba el parser financiero canónico");
must(engine.includes("validateReceiptFinancials")&&engine.includes("RECEIPT_OCR_METHOD_PREFIX"),"El pipeline canónico debe seguir desembocando en validación financiera y revisión versionada");
must(provenance.includes('SERVER_RECEIPT_OCR_RUNTIME = "server-tesseract-7"'),"La fuente única de runtime Tesseract 7 ha desaparecido");

if(failures.length){
  console.error("Canonical document OCR audit FAILED");
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log("Canonical document OCR audit OK · Drive, reintentos y recuperación usan una sola lectura Tesseract + geometría + parser_v7 + validación financiera");
