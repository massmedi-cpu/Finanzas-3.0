import fs from "node:fs";

const read=(file)=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const client=read("app/archivo/archive-client.tsx");
const engine=read("lib/document/ticket-ocr-engine.ts");
const preprocessor=read("lib/document/receipt-image-preprocessor.ts");
const validator=read("lib/document/receipt-financial-validator.ts");
const revision=read("lib/document/receipt-ocr-revision.ts");
const receiptLayout=read("lib/document/receipt-layout.ts");
const visual=read("app/archivo/receipt-geometry-preview.tsx");
const loader=read("public/vendor/paddleocr-loader.mjs");
const baseOcr=read("lib/document/ticket-ocr.ts");
const archiveApi=read("app/api/archive/[id]/route.ts");
const tsconfig=read("tsconfig.json");
const pkg=JSON.parse(read("package.json"));
const version=read("lib/app-version.ts");

must(client.includes("recognizeTicketImage(file,worker,onProgress,hint)"),"Archivo no usa el motor OCR canónico");
must(client.includes("RECEIPT_OCR_METHOD_PREFIX")&&client.includes("needsOcrUpgrade")&&client.includes("upgradeExistingOcr"),"Falta migración automática de revisiones OCR anteriores desde el original");
must(client.includes("PaddleOCR.create")&&client.includes('lang:"es"')&&client.includes('ocrVersion:"PP-OCRv6"'),"Archivo no inicializa una combinación PaddleOCR soportada para español");
must(!client.includes('ocrVersion:"PP-OCRv5"'),"La combinación PP-OCRv5 + lang es no está soportada por PaddleOCR.js 0.4.2");
must(client.includes("sharedWorkerPromise")&&client.includes("workerReuse:true"),"El motor OCR debe reutilizarse entre documentos");
must(!client.includes("Tesseract")&&!engine.includes("Tesseract"),"Tesseract no puede permanecer en el runtime OCR de Archivo");
for(const token of ["rawText:recognized.rawText","normalizedText:recognized.normalizedText","validation:recognized.validation","metrics:recognized.metrics","visualLayout","localProcessing:true","automaticOnImport:true"])
  must(client.includes(token),`Archivo no persiste la evidencia OCR: ${token}`);

for(const token of ["engine.predict(input","PP-OCRv6","ppocrv6_es_geometry","groupRows","makeVisualLayout","strictReceiptLayout","validateReceiptFinancials","RECEIPT_OCR_METHOD_PREFIX","rawText","normalizedText","visualLayout","metrics","prepareReceiptImage","paperDetected","discardedBoxCount","trustedText","literalText"])
  must(engine.includes(token),`Motor PP-OCRv6 canónico incompleto: ${token}`);
must((engine.match(/engine\.predict\(/g)||[]).length===1,"El OCR canónico debe mantener una sola inferencia PP-OCRv6");
must(engine.includes("input = prepared.grayscale")&&!engine.includes("input = prepared.adaptive"),"El aislamiento de papel debe usar gris conservador, nunca binarización adaptativa destructiva");
must(engine.includes("if (prepared.paperDetected)")&&engine.includes("input = file"),"El recorte de papel debe tener fallback al original si no hay detección segura");
must(engine.includes("textRecScoreThresh: 0.2"),"Falta umbral mínimo de reconocimiento para descartar cajas de confianza extrema baja");
must(preprocessor.includes("detectPaper")&&preprocessor.includes("rectifyPaper")&&preprocessor.includes("perspectiveCorrected"),"El preprocesador seguro de papel está incompleto");
must(!engine.includes("localAdaptiveThreshold")&&!engine.includes("reconstructReceiptEvidence"),"El runtime canónico no puede binarizar ni inventar reconstrucción multipasada");
must(!/recognizeLegacyTicket|geometryReceiptPass|totalsZonePass|fastcrop_|locator_money_columns|adaptive_psm|grayscale_psm/.test(engine),"Sobrevive un fallback o pasada del OCR anterior");
must(!fs.existsSync("lib/document/ticket-ocr-v307.ts"),"No debe existir un segundo motor OCR runtime versionado");
must(!fs.existsSync("lib/document/ticket-ocr-geometry.ts"),"El motor geométrico legado debe estar eliminado, no dormido en runtime");

must(loader.includes("@paddleocr/paddleocr-js@0.4.2")&&loader.includes("financial-paddleocr-ready"),"Falta loader estable de PaddleOCR.js");
must(visual.includes("isReceiptVisualLayout")&&visual.includes("ReceiptGeometryPreview")&&visual.includes("position: \"absolute\""),"La vista del ticket no reconstruye su maquetación desde coordenadas");
must(receiptLayout.includes("unparsedBody")&&receiptLayout.includes("top")&&receiptLayout.includes("bottom"),"El contrato de layout debe conservar filas no interpretadas y geometría");

for(const token of ["needs_review","failed","invalid_item_arithmetic","unparsed_body_rows","items_total_mismatch","base_tax_total_mismatch"])
  must(validator.includes(token),`Validador financiero incompleto: ${token}`);
must(revision.includes('paddle_layout_v3')&&revision.includes('image_ocr_receipt_v501:'),"La revisión OCR PP-OCRv6 no está identificada de forma estable");

for(const token of ["rawText","normalizedText","layoutText","tsv","validation","metrics"])
  must(baseOcr.includes(token),`El contrato OCR ha perdido ${token}`);
must(/documentType\s*!==\s*["']receipt["']/.test(baseOcr),"Los tickets no deben inferir importe desde cualquier decimal cuando falta total");
must(/tomorrow/.test(baseOcr)&&/documentType\s*===\s*["']receipt["']/.test(baseOcr),"Las fechas futuras imposibles de tickets deben rechazarse");
must(/raz\[oó\]n\\s\+social/.test(baseOcr)&&/tel\[eé\]fono/.test(baseOcr),"Metadatos fiscales y teléfono no deben convertirse en nombre comercial");

must(archiveApi.includes("validateReceiptFinancials")&&archiveApi.includes('method.startsWith("image_ocr_receipt_")')&&archiveApi.includes("validation.status"),"La API no revalida el OCR antes de persistir estado complete");
must(tsconfig.includes('"@/lib/document/ticket-ocr": ["./lib/document/ticket-ocr-engine"]'),"El alias OCR no apunta al único motor canónico");
must(String(pkg.scripts?.["test:ocr"]||"").includes("ticket-ocr-v302-tests.ts"),"CI no ejecuta las regresiones OCR");

const runtime=[engine,validator,receiptLayout,visual].join("\n");
for(const forbidden of ["ENERGY","CUBATA","TERCIO GALICIA","CAÑA GRANDE","CANA GRANDE","AGUA CON GAS","ÁVILA BAR","AVILA BAR"])
  must(!runtime.toUpperCase().includes(forbidden.toUpperCase()),`Runtime OCR contiene vocabulario específico prohibido: ${forbidden}`);

const versionMatch=version.match(/APP_VERSION\s*=\s*["'](\d+)\.(\d+)\.(\d+)["']/);
must(Boolean(versionMatch),"APP_VERSION debe ser semántica");

if(failures.length){
  console.error("Ticket OCR integrity audit FAILED");
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Ticket OCR integrity audit OK · PP-OCRv6 español · papel aislado con fallback seguro · geometría preservada · una sola inferencia · ${versionMatch?.[0]||"APP_VERSION"}`);
