import fs from "node:fs";

const read=(file)=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const client=read("app/archivo/archive-client.tsx");
const engine=read("lib/document/ticket-ocr-engine.ts");
const provenance=read("lib/document/receipt-ocr-provenance.ts");
const metadataBoundary=read("lib/document/ticket-ocr-metadata.ts");
const preprocessor=read("lib/document/receipt-image-preprocessor.ts");
const validator=read("lib/document/receipt-financial-validator.ts");
const revision=read("lib/document/receipt-ocr-revision.ts");
const receiptLayout=read("lib/document/receipt-layout.ts");
const visual=read("app/archivo/receipt-geometry-preview.tsx");
const loader=read("public/vendor/receipt-ocr-loader.mjs");
const legacyLoader=read("public/vendor/paddleocr-loader.mjs");
const serverOcr=read("app/api/ocr/receipt/route.ts");
const serverOcrCore=read("lib/document/server-receipt-ocr.ts");
const nextConfig=read("next.config.ts");
const baseOcr=read("lib/document/ticket-ocr.ts");
const archiveApi=read("app/api/archive/[id]/route.ts");
const tsconfig=read("tsconfig.json");
const pkg=JSON.parse(read("package.json"));
const version=read("lib/app-version.ts");

must(client.includes("recognizeTicketImage(file,worker,onProgress,hint)"),"Archivo no usa el motor OCR canónico");
must(client.includes("isCompatibleReceiptOcrMethod")&&client.includes("needsOcrUpgrade")&&client.includes("upgradeExistingOcr"),"Falta migración automática precisa de revisiones OCR no compatibles desde el original");
must(client.includes("ReceiptOCR.create()")&&client.includes('script.src="/vendor/receipt-ocr-loader.mjs"'),"Archivo ha perdido el adaptador OCR geométrico actual");
must(!client.includes('ocrVersion:"PP-OCRv6"')&&!client.includes('ocrVersion:"PP-OCRv5"'),"El cliente no puede declarar modelos Paddle que no ejecuta");
must(client.includes("sharedWorkerPromise")&&client.includes("workerReuse:true"),"El adaptador OCR debe reutilizarse entre documentos");
must(client.includes("SERVER_RECEIPT_OCR_RUNTIME")&&engine.includes("SERVER_RECEIPT_OCR_RUNTIME")&&engine.includes("Tesseract 7"),"Cliente y motor deben declarar la procedencia real Tesseract del servidor");
must(!engine.includes("PaddleOCR.js")&&!engine.includes("PP-OCRv6"),"El motor actual no puede persistir una procedencia Paddle falsa");
must(client.includes('from "@/lib/document/ticket-ocr-metadata"')&&metadataBoundary.includes('from "./ticket-ocr"'),"Archivo debe cargar solo el parser ligero de metadatos en el bundle inicial");
must(client.includes('import("@/lib/document/ticket-ocr")')&&client.includes("await Promise.all"),"El motor geométrico OCR debe entrar por import dinámico cuando se procesa una imagen");
must(!client.includes("useEffect")&&!/setTimeout[\s\S]{0,120}makeWorker/.test(client),"Archivo no debe precargar el worker OCR al montar la pantalla");
must((client.match(/makeWorker\(/g)||[]).length===3,"makeWorker solo debe existir en su declaración y en las dos rutas reales de OCR");
must((client.match(/loadReceiptOcr\(/g)||[]).length===2,"El adaptador OCR solo debe cargarse desde makeWorker bajo demanda");
must(client.includes("useMemo(()=>detail?reconstructionReceiptLayout(detail)||parseReceiptLayout(reconstructionLayout):null")&&client.includes("detail.digitalReconstruction&&receiptLayout&&"),"La reconstrucción del ticket debe calcularse solo con un documento abierto y quedar memoizada");
for(const token of ["rawText:recognized.rawText","normalizedText:recognized.normalizedText","validation:recognized.validation","metrics:recognized.metrics","visualLayout","localProcessing:false","automaticOnImport:true",'assetOrigin:"server-bundled"'])
  must(client.includes(token),`Archivo no persiste la evidencia OCR real: ${token}`);
must(client.includes("failedBody")&&client.includes("applyDetail(failedBody.document")&&client.includes('detail.ocrStatus==="failed"')&&client.includes("El ticket está guardado, pero el OCR no ha podido leerlo"),"Un fallo OCR debe conservar el original, abrir el documento y mostrar un aviso visible");

for(const token of ["engine.predict(input","receiptOcrRuntime(result.runtime)","receiptOcrVariant(paperDetected)","groupRows","makeVisualLayout","strictReceiptLayout","validateReceiptFinancials","RECEIPT_OCR_METHOD_PREFIX","rawText","normalizedText","visualLayout","metrics","prepareReceiptImage","paperDetected","discardedBoxCount","trustedText","literalText"])
  must(engine.includes(token),`Motor geométrico canónico incompleto: ${token}`);
must((engine.match(/engine\.predict\(/g)||[]).length===1,"El OCR canónico debe mantener una sola inferencia de reconocimiento");
must(engine.includes("input = prepared.grayscale")&&!engine.includes("input = prepared.adaptive"),"El aislamiento de papel debe usar gris conservador, nunca binarización adaptativa destructiva");
must(engine.includes("if (prepared.paperDetected)")&&engine.includes("input = file"),"El recorte de papel debe tener fallback al original si no hay detección segura");
must(engine.includes("textRecScoreThresh: 0.2"),"Falta umbral mínimo de reconocimiento para descartar cajas de confianza extrema baja");
must(engine.includes('if (!runtime) throw new Error("El OCR no declaró el runtime Tesseract 7 esperado")'),"El motor debe fallar cerrado si el adaptador no declara el runtime esperado");
must(preprocessor.includes("detectPaper")&&preprocessor.includes("rectifyPaper")&&preprocessor.includes("perspectiveCorrected"),"El preprocesador seguro de papel está incompleto");
must(!engine.includes("localAdaptiveThreshold")&&!engine.includes("reconstructReceiptEvidence"),"El runtime canónico no puede binarizar ni inventar reconstrucción multipasada");
must(!/recognizeLegacyTicket|geometryReceiptPass|totalsZonePass|fastcrop_|locator_money_columns|adaptive_psm|grayscale_psm/.test(engine),"Sobrevive un fallback o pasada del OCR anterior");
must(!fs.existsSync("lib/document/ticket-ocr-v307.ts"),"No debe existirir un segundo motor OCR runtime versionado");
must(!fs.existsSync("lib/document/ticket-ocr-geometry.ts"),"El motor geométrico legado debe estar eliminado, no dormido en runtime");

must(loader.includes('SERVER_OCR_ENDPOINT = "/api/ocr/receipt"')&&loader.includes("serverPredict")&&loader.includes("financial-receipt-ocr-ready"),"El adaptador del navegador no apunta de forma estable al OCR autenticado del servidor");
must(loader.includes("SERVER_TIMEOUT_MS = 55_000")&&loader.includes("MAX_SIDE = 3400")&&loader.includes("DIRECT_BLOB_LIMIT"),"El proxy OCR móvil ha perdido límites de tiempo, tamaño o escalado");
must(loader.includes("MAX_SERVER_BYTES = 4.5 * 1024 * 1024")&&loader.includes("constrainedCanvasBlob")&&loader.includes("DIRECT_IMAGE_TYPES")&&loader.includes("HEIC/HEIF"),"El proxy OCR debe convertir formatos decodificables y garantizar una copia por debajo del límite del servidor");
for(const forbidden of ["PaddleOCR","PP-OCRv6","onnxruntime","cdn.jsdelivr.net/npm/@paddleocr"])
  must(!loader.includes(forbidden),`El adaptador actual conserva una dependencia/etiqueta inexistente: ${forbidden}`);
must(legacyLoader.includes('import "/vendor/receipt-ocr-loader.mjs"')&&legacyLoader.includes("Legacy browser shim"),"El loader Paddle anterior debe limitarse a delegar en el adaptador actual para cachés antiguas");

must(serverOcr.includes('from "@/lib/document/server-receipt-ocr"')&&serverOcr.includes("recognizeServerReceiptImage"),"La ruta OCR debe delegar en el núcleo Tesseract canónico compartido");
must(!serverOcr.includes("createWorker("),"La ruta OCR no debe mantener un segundo worker Tesseract paralelo");
for(const token of ['createWorker("spa"','workerPath:path.join(root,"node_modules","tesseract.js"','corePath:path.join(root,"node_modules","tesseract.js-core")','OCR_LANGUAGE_ROOT=path.join(process.cwd(),"node_modules","@tesseract.js-data","spa","4.0.0")','langPath:OCR_LANGUAGE_ROOT','SERVER_RECEIPT_OCR_RUNTIME','new ServerReceiptOcrError("ocr_server_failed",503,true'])
  must(serverOcrCore.includes(token),`Núcleo OCR de servidor incompleto o sin ruta Tesseract fijada: ${token}`);
must(serverOcr.includes("ServerReceiptOcrError")&&serverOcr.includes("return apiError(error.code,error.status)"),"La ruta OCR debe propagar de forma controlada códigos y estados del núcleo compartido");
for(const token of ["./node_modules/tesseract.js/**/*","./node_modules/tesseract.js-core/**/*","./node_modules/@tesseract.js-data/spa/**/*","./node_modules/regenerator-runtime/**/*","./node_modules/wasm-feature-detect/**/*","./node_modules/zlibjs/**/*","./node_modules/bmp-js/**/*","./node_modules/is-url/**/*","./node_modules/node-fetch/**/*","./node_modules/idb-keyval/**/*"])
  must(nextConfig.includes(token),`El bundle de /api/ocr/receipt no traza una dependencia runtime necesaria: ${token}`);
must(!nextConfig.includes("./public/vendor/document-engine/tessdata/**/*"),"El idioma OCR no debe duplicarse en public y node_modules");
must(nextConfig.includes("'/api/ocr/receipt': ocrRuntimeAssets"),"Next no aplica el trazado OCR a /api/ocr/receipt");
must(nextConfig.includes("source: '/vendor/receipt-ocr-loader.mjs'")&&nextConfig.includes("no-store, max-age=0"),"El adaptador OCR operativo debe tener política no-store propia");

must(visual.includes("isReceiptVisualLayout")&&visual.includes("ReceiptGeometryPreview")&&visual.includes("viewBox")&&visual.includes("textLength")&&visual.includes('lengthAdjust="spacingAndGlyphs"'),"La vista del ticket no reconstruye su maquetación desde coordenadas");
must(receiptLayout.includes("unparsedBody")&&receiptLayout.includes("top")&&receiptLayout.includes("bottom"),"El contrato de layout debe conservar filas no interpretadas y geometría");

for(const token of ["needs_review","failed","invalid_item_arithmetic","unparsed_body_rows","items_total_mismatch","base_tax_total_mismatch"])
  must(validator.includes(token),`Validador financiero incompleto: ${token}`);
for(const token of [
  'SERVER_RECEIPT_OCR_RUNTIME = "server-tesseract-7"',
  'SERVER_RECEIPT_OCR_ENGINE = "Tesseract.js 7 · servidor"',
  'SERVER_RECEIPT_OCR_MODEL = "spa.traineddata"',
  'SERVER_RECEIPT_OCR_GEOMETRY_REVISION = "server_tesseract_7_geometry_v1"',
]) must(provenance.includes(token),`Procedencia OCR canónica incompleta: ${token}`);
must(revision.includes("SERVER_RECEIPT_OCR_GEOMETRY_REVISION")&&revision.includes('RECEIPT_PARSER_REVISION = "parser_v8"')&&revision.includes('image_ocr_receipt_v501:'),"La revisión OCR geométrica actual no está identificada de forma estable");
must(revision.includes('image_ocr_receipt_v501:paddle_layout_v6:parser_v7:'),"La compatibilidad histórica debe conservar de forma explícita la revisión parser_v7 equivalente");

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
console.log(`Ticket OCR integrity audit OK · adaptador cliente bajo demanda · Tesseract autenticado y veraz en núcleo compartido · fallo visible y original recuperable · bundle server-only trazado · geometría y validación preservadas · una sola inferencia · ${versionMatch?.[0]||"APP_VERSION"}`);
