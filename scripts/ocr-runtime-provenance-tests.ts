import fs from "node:fs";
import {
  RECEIPT_OCR_METHOD_PREFIX,
  isCompatibleReceiptOcrMethod,
  isCurrentReceiptOcrMethod,
} from "../lib/document/receipt-ocr-revision";
import {
  SERVER_RECEIPT_OCR_ENGINE,
  SERVER_RECEIPT_OCR_MODEL,
  SERVER_RECEIPT_OCR_RUNTIME,
} from "../lib/document/receipt-ocr-provenance";

const read=(file:string)=>fs.readFileSync(file,"utf8");
const failures:string[]=[];
const must=(ok:unknown,message:string)=>{if(!ok)failures.push(message)};

const engine=read("lib/document/ticket-ocr-engine.ts");
const server=read("lib/document/server-receipt-ocr.ts");
const canonical=read("lib/document/server-canonical-receipt.ts");
const archive=read("app/archivo/archive-client.tsx");
const loader=read("public/vendor/receipt-ocr-loader.mjs");
const legacyLoader=read("public/vendor/paddleocr-loader.mjs");
const reprocess=read("lib/document/server-archive-ocr-reprocess.ts");
const drive=read("lib/document/drive-content-hydration.ts");

must(SERVER_RECEIPT_OCR_RUNTIME==="server-tesseract-7","Runtime canónico OCR incorrecto");
must(SERVER_RECEIPT_OCR_ENGINE.includes("Tesseract.js 7"),"Motor OCR canónico no identifica Tesseract 7");
must(SERVER_RECEIPT_OCR_MODEL==="spa.traineddata","Modelo/idioma OCR canónico incorrecto");
must(RECEIPT_OCR_METHOD_PREFIX.includes("server_tesseract_7_geometry_v1"),"El método actual no refleja el runtime real");
must(!RECEIPT_OCR_METHOD_PREFIX.includes("paddle"),"El método actual conserva una etiqueta Paddle falsa");

const current=`${RECEIPT_OCR_METHOD_PREFIX}server_tesseract_7_geometry`;
const legacyCurrent="image_ocr_receipt_v501:paddle_layout_v6:parser_v7:ppocrv6_es_geometry";
const legacyParser="image_ocr_receipt_v501:paddle_layout_v6:parser_v2:ppocrv6_es_geometry";
const legacyLayout="image_ocr_receipt_v501:paddle_layout_v4:ppocrv6_es_paper_geometry";
const legacyFastcrop="image_ocr_receipt_v501:fastcrop_v3:fastcrop_gray_psm6";
must(isCurrentReceiptOcrMethod(current),"El método Tesseract actual no se reconoce como actual");
must(isCompatibleReceiptOcrMethod(current),"El método Tesseract actual no se reconoce como compatible");
must(!isCurrentReceiptOcrMethod(legacyCurrent),"La etiqueta Paddle histórica no debe presentarse como actual");
must(isCompatibleReceiptOcrMethod(legacyCurrent),"La revisión histórica parser_v7 debe seguir siendo compatible sin reprocesado forzado");
must(!isCompatibleReceiptOcrMethod(legacyParser),"parser_v2 debe seguir marcado para actualización");
must(!isCompatibleReceiptOcrMethod(legacyLayout),"paddle_layout_v4 debe seguir marcado para actualización");
must(!isCompatibleReceiptOcrMethod(legacyFastcrop),"fastcrop_v3 debe seguir marcado para actualización");

for(const forbidden of ["PaddleOCR.js","PP-OCRv6","ppocrv6_es_geometry","ppocrv6_es_paper_geometry"])
  must(!engine.includes(forbidden),`El pipeline actual conserva una procedencia falsa: ${forbidden}`);
for(const required of ["receiptOcrRuntime(result.runtime)","SERVER_RECEIPT_OCR_ENGINE","SERVER_RECEIPT_OCR_MODEL","SERVER_RECEIPT_OCR_RUNTIME","receiptOcrVariant(paperDetected)"])
  must(engine.includes(required),`Pipeline OCR sin contrato de procedencia: ${required}`);
must(engine.includes("if (!runtime) throw"),"El pipeline debe fallar cerrado si el adaptador no declara el runtime esperado");

must(archive.includes("isCompatibleReceiptOcrMethod(ocrMethod(document))"),"Archivo no protege la compatibilidad legacy precisa");
must(archive.includes("/vendor/receipt-ocr-loader.mjs"),"Archivo no usa el adaptador OCR genérico");
must(!archive.includes("/vendor/paddleocr-loader.mjs"),"Archivo nuevo sigue cargando el adaptador Paddle legacy");
must(!archive.includes("ocrVersion:\"PP-OCRv6\""),"Archivo sigue configurando un modelo Paddle inexistente");
must(!archive.includes("pdf_ocr_ppocrv6")&&!archive.includes("pdf_hybrid_ppocrv6"),"Los PDF escaneados conservan un método Paddle falso");
must(archive.includes("pdf_ocr_server_tesseract_v1")&&archive.includes("pdf_hybrid_server_tesseract_v1"),"Los PDF escaneados no declaran Tesseract");

for(const forbidden of ["PaddleOCR","PP-OCRv6","onnxruntime","jsdelivr"])
  must(!loader.includes(forbidden),`El adaptador actual contiene dependencia/etiqueta Paddle: ${forbidden}`);
must(loader.includes("/api/ocr/receipt")&&loader.includes("__financialReceiptOCR"),"El adaptador actual no apunta al OCR privado de servidor");
must(legacyLoader.includes("Legacy browser shim")&&legacyLoader.includes("/vendor/receipt-ocr-loader.mjs"),"El loader antiguo no está reducido a shim de compatibilidad");
must(!legacyLoader.includes("PP-OCRv6")&&!legacyLoader.includes("onnxruntime"),"El shim legacy conserva lógica/modelo Paddle");

must(server.includes("runtime:SERVER_RECEIPT_OCR_RUNTIME"),"El endpoint Tesseract no devuelve la constante canónica de runtime");
for(const token of ["recognizeServerReceiptImage","recognizeTicketImage","receiptOcrRuntime","server_ocr_runtime_mismatch"])
  must(canonical.includes(token),`La entrada server-side canónica está incompleta: ${token}`);
for(const source of [reprocess,drive]){
  must(source.includes("SERVER_RECEIPT_OCR_ENGINE"),"Una ruta de persistencia no guarda el motor canónico");
  must(source.includes("SERVER_RECEIPT_OCR_MODEL"),"Una ruta de persistencia no guarda el modelo canónico");
  must(source.includes("SERVER_RECEIPT_OCR_RUNTIME"),"Una ruta de persistencia no guarda el runtime canónico");
  must(source.includes("recognizeCanonicalReceiptBytes"),"Una ruta server-side evita el OCR canónico compartido");
  must(!source.includes("recognizeServerReceiptImage("),"Una ruta server-side conserva una llamada Tesseract paralela");
}
must(drive.includes("method:parsed.method"),"Drive debe persistir la revisión OCR canónica real");
must(drive.includes('sourceMethod:"drive_auto_image_canonical_v2"'),"Drive debe conservar su procedencia de ingestión separada del método OCR");
must(drive.includes('financiallyValid=parsed.validation?.status==="complete"'),"Drive no exige validación financiera canónica antes de completar");

if(failures.length){
  console.error("OCR runtime provenance tests FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("OCR runtime provenance tests OK · Tesseract veraz y pipeline único para Archivo, Drive y reprocesado");
