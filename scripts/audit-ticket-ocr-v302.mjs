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
const serverOcr=read("app/api/ocr/receipt/route.ts");
const nextConfig=read("next.config.ts");
const baseOcr=read("lib/document/ticket-ocr.ts");
const archiveApi=read("app/api/archive/[id]/route.ts");
const tsconfig=read("tsconfig.json");
const pkg=JSON.parse(read("package.json"));
const version=read("lib/app-version.ts");

must(client.includes("recognizeTicketImage(file,worker,onProgress,hint)"),"Archivo no usa el motor OCR canónico");
must(client.includes("RECEIPT_OCR_METHOD_PREFIX")&&client.includes("needsOcrUpgrade")&&client.includes("upgradeExistingOcr"),"Falta migración automática de revisiones OCR anteriores desde el original");
must(client.includes("PaddleOCR.create")&&client.includes('lang:"es"')&&client.includes('ocrVersion:"PP-OCRv6"'),"Archivo ha perdido el contrato de compatibilidad del adaptador OCR geométrico");
must(!client.includes('ocrVersion:"PP-OCRv5"'),"La combinación PP-OCRv5 + lang es no está soportada por el contrato OCR actual");
must(client.includes("sharedWorkerPromise")&&client.includes("workerReuse:true"),"El adaptador OCR debe reutilizarse entre documentos");
must(!client.includes("Tesseract")&&!engine.includes("Tesseract"),"El motor geométrico de cliente no debe acoplarse directamente a Tesseract");
for(const token of ["rawText:recognized.rawText","normalizedText:recognized.normalizedText","validation:recognized.validation","metrics:recognized.metrics","visualLayout","localProcessing:false","automaticOnImport:true",'assetOrigin:"server-bundled"'])
  must(client.includes(token),`Archivo no persiste la evidencia OCR real: ${token}`);
must(client.includes("failedBody")&&client.includes("applyDetail(failedBody.document")&&client.includes('detail.ocrStatus==="failed"')&&client.includes("El ticket está guardado, pero el OCR no ha podido leerlo"),"Un fallo OCR debe conservar el original, abrir el documento y mostrar un aviso visible");

for(const token of ["engine.predict(input","PP-OCRv6","ppocrv6_es_geometry","groupRows","makeVisualLayout","strictReceiptLayout","validateReceiptFinancials","RECEIPT_OCR_METHOD_PREFIX","rawText","normalizedText","visualLayout","metrics","prepareReceiptImage","paperDetected","discardedBoxCount","trustedText","literalText"])
  must(engine.includes(token),`Motor geométrico canónico incompleto: ${token}`);
must((engine.match(/engine\.predict\(/g)||[]).length===1,"El OCR canónico debe mantener una sola inferencia de reconocimiento");
must(engine.includes("input = prepared.grayscale")&&!engine.includes("input = prepared.adaptive"),"El aislamiento de papel debe usar gris conservador, nunca binarización adaptativa destructiva");
must(engine.includes("if (prepared.paperDetected)")&&engine.includes("input = file"),"El recorte de papel debe tener fallback al original si no hay detección segura");
must(engine.includes("textRecScoreThresh: 0.2"),"Falta umbral mínimo de reconocimiento para descartar cajas de confianza extrema baja");
must(preprocessor.includes("detectPaper")&&preprocessor.includes("rectifyPaper")&&preprocessor.includes("perspectiveCorrected"),"El preprocesador seguro de papel está incompleto");
must(!engine.includes("localAdaptiveThreshold")&&!engine.includes("reconstructReceiptEvidence"),"El runtime canónico no puede binarizar ni inventar reconstrucción multipasada");
must(!/recognizeLegacyTicket|geometryReceiptPass|totalsZonePass|fastcrop_|locator_money_columns|adaptive_psm|grayscale_psm/.test(engine),"Sobrevive un fallback o pasada del OCR anterior");
must(!fs.existsSync("lib/document/ticket-ocr-v307.ts"),"No debe existir un segundo motor OCR runtime versionado");
must(!fs.existsSync("lib/document/ticket-ocr-geometry.ts"),"El motor geométrico legado debe estar eliminado, no dormido en runtime");

must(loader.includes('SERVER_OCR_ENDPOINT = "/api/ocr/receipt"')&&loader.includes("serverPredict")&&loader.includes("financial-paddleocr-ready"),"El adaptador del navegador no apunta de forma estable al OCR autenticado del servidor");
must(loader.includes("SERVER_TIMEOUT_MS = 55_000")&&loader.includes("MAX_SIDE = 2600")&&loader.includes("DIRECT_BLOB_LIMIT"),"El proxy OCR móvil ha perdido límites de tiempo, tamaño o escalado");
must(!loader.includes("LEGACY_PADDLE_BASELINE")&&!loader.includes("cdn.jsdelivr.net/npm/@paddleocr"),"El loader conserva una firma Paddle obsoleta que ya no corresponde al runtime real");
for(const token of ['createWorker("spa"','workerPath: path.join(root, "node_modules", "tesseract.js"','corePath: path.join(root, "node_modules", "tesseract.js-core")','OCR_LANGUAGE_ROOT = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "spa", "4.0.0")','langPath: OCR_LANGUAGE_ROOT','runtime: "server-tesseract-7"','apiError("ocr_server_failed", 503)'])
  must(serverOcr.includes(token),`OCR de servidor incompleto o sin ruta Tesseract fijada: ${token}`);
for(const token of ["./node_modules/tesseract.js/**/*","./node_modules/tesseract.js-core/**/*","./node_modules/@tesseract.js-data/spa/**/*","./node_modules/regenerator-runtime/**/*","./node_modules/wasm-feature-detect/**/*","./node_modules/zlibjs/**/*","./node_modules/bmp-js/**/*","./node_modules/is-url/**/*","./node_modules/node-fetch/**/*","./node_modules/idb-keyval/**/*"])
  must(nextConfig.includes(token),`El bundle de /api/ocr/receipt no traza una dependencia runtime necesaria: ${token}`);
must(!nextConfig.includes("./public/vendor/document-engine/tessdata/**/*"),"El idioma OCR no debe duplicarse en public y node_modules");
must(nextConfig.includes("'/api/ocr/receipt': ocrRuntimeAssets"),"Next no aplica el trazado OCR a /api/ocr/receipt");

must(visual.includes("isReceiptVisualLayout")&&visual.includes("ReceiptGeometryPreview")&&visual.includes("viewBox")&&visual.includes("textLength")&&visual.includes('lengthAdjust="spacingAndGlyphs"'),"La vista del ticket no reconstruye su maquetación desde coordenadas");
must(receiptLayout.includes("unparsedBody")&&receiptLayout.includes("top")&&receiptLayout.includes("bottom"),"El contrato de layout debe conservar filas no interpretadas y geometría");

for(const token of ["needs_review","failed","invalid_item_arithmetic","unparsed_body_rows","items_total_mismatch","base_tax_total_mismatch"])
  must(validator.includes(token),`Validador financiero incompleto: ${token}`);
const ocrRevisionNumber=Number.parseInt(revision.match(/paddle_layout_v(\d+)/)?.[1]||"0",10);
must(ocrRevisionNumber>=4&&revision.includes('image_ocr_receipt_v501:'),"La revisión OCR geométrica no está identificada de forma estable o retrocede por debajo de paddle_layout_v4");

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
console.log(`Ticket OCR integrity audit OK · reconocimiento Tesseract autenticado en servidor · fallo visible y original recuperable · bundle runtime server-only trazado · geometría y validación preservadas · una sola inferencia · ${versionMatch?.[0]||"APP_VERSION"}`);
