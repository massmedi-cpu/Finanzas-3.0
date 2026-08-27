import fs from "node:fs";

function must(condition,message){if(!condition)throw new Error(message)}
const client=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
const engine=fs.readFileSync("lib/document/ticket-ocr-engine.ts","utf8");
const preprocessor=fs.readFileSync("lib/document/receipt-image-preprocessor.ts","utf8");
const reconstruction=fs.readFileSync("lib/document/receipt-reconstruction.ts","utf8");
const validator=fs.readFileSync("lib/document/receipt-financial-validator.ts","utf8");
const revision=fs.readFileSync("lib/document/receipt-ocr-revision.ts","utf8");
const receiptLayout=fs.readFileSync("lib/document/receipt-layout.ts","utf8");
const baseOcr=fs.readFileSync("lib/document/ticket-ocr.ts","utf8");
const archiveLib=fs.readFileSync("lib/financial/archive.ts","utf8");
const archiveApi=fs.readFileSync("app/api/archive/[id]/route.ts","utf8");
const tsconfig=fs.readFileSync("tsconfig.json","utf8");
const css=fs.readFileSync("app/archive.css","utf8");
const controls=fs.readFileSync("app/controls.css","utf8");
const appVersion=fs.readFileSync("lib/app-version.ts","utf8");
const manifest=fs.readFileSync("app/manifest.ts","utf8");
const settings=fs.readFileSync("lib/financial/settings.ts","utf8");
const proxy=fs.readFileSync("proxy.ts","utf8");
const nextConfig=fs.readFileSync("next.config.ts","utf8");
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));

must(client.includes('recognizeTicketImage(file,worker,onProgress,hint)'),"Archivo debe usar el motor OCR canónico para imágenes");
must(client.includes('upload(e.target.files[0],"receipt")'),"Cámara y galería deben iniciar OCR de ticket automáticamente");
must(client.includes("automaticOnImport:true"),"El resultado OCR debe registrar que se ejecutó automáticamente al importar");
must(client.includes("RECEIPT_OCR_METHOD_PREFIX")&&client.includes("needsOcrUpgrade")&&client.includes("upgradeExistingOcr")&&client.includes("startsWith(RECEIPT_OCR_METHOD_PREFIX)"),"Los tickets de revisiones OCR anteriores deben actualizarse automáticamente desde el original");
must(client.includes("sharedWorkerPromise")&&client.includes("workerReuse:true"),"El worker OCR debe reutilizarse entre lecturas");
must(tsconfig.includes('"@/lib/document/ticket-ocr": ["./lib/document/ticket-ocr-engine"]'),"La app debe importar OCR mediante alias estable");

for(const token of ["prepareReceiptImage","adaptive_psm6","grayscale_psm4","reconstructReceiptEvidence","validateReceiptFinancials","RECEIPT_OCR_METHOD_PREFIX","rawText","normalizedText","tsv","metrics"])
  must(engine.includes(token),`El motor OCR canónico debe incluir ${token}`);
for(const token of ["detectPaper","rectifyPaper","estimateDeskewFromSamples","deskew","localAdaptiveThreshold","contrastStretch"])
  must(preprocessor.includes(token),`El preprocesado geométrico debe incluir ${token}`);
must(!engine.includes("recognizeLegacyTicket")&&!engine.includes("geometryReceiptPass")&&!engine.includes("totalsZonePass"),"No debe existir fallback a motores OCR paralelos");
must(!engine.includes("locator_money_columns_psm6")&&!engine.includes("fastcrop_adaptive_psm6")&&!engine.includes("fastcrop_gray_psm6"),"No debe sobrevivir el pipeline fastcrop paralelo");
must(!fs.existsSync("lib/document/ticket-ocr-v307.ts"),"No debe reaparecer un motor OCR runtime versionado alternativo");

for(const token of ["samePhysicalRow","mergePhysicalRows","arithmeticValid","cleanReceiptMerchant","reconstructReceiptEvidence"])
  must(reconstruction.includes(token),`La reconstrucción física por evidencia debe incluir ${token}`);
must(reconstruction.includes("Never shift descriptions by price similarity or lexical resemblance"),"Las descripciones no pueden desplazarse por similitud de precio o texto");
for(const token of ["needs_review","failed","invalid_item_arithmetic","unparsed_body_rows","items_total_mismatch","base_tax_total_mismatch"])
  must(validator.includes(token),`La validación financiera debe proteger ${token}`);
must(revision.includes('canonical_integrity_v5')&&revision.includes('image_ocr_receipt_v501:'),"La revisión OCR canónica debe estar versionada");
must(receiptLayout.includes("parseReceiptTsvLayout")&&receiptLayout.includes("ReceiptLineItem")&&receiptLayout.includes("unparsedBody")&&receiptLayout.includes("top")&&receiptLayout.includes("bottom"),"La estructura debe conservar geometría y filas no interpretadas");
must(String(pkg.scripts?.["test:ocr"]||"").includes("ticket-ocr-v302-tests.ts"),"Los tests OCR de integridad deben ejecutarse en CI");

must(baseOcr.includes("rawText")&&baseOcr.includes("normalizedText")&&baseOcr.includes("layoutText")&&baseOcr.includes("tsv")&&baseOcr.includes("validation")&&baseOcr.includes("metrics"),"El contrato OCR debe preservar evidencia RAW, normalizada, geometría y métricas por separado");
must(client.includes("rawText:recognized.rawText")&&client.includes("normalizedText:recognized.normalizedText")&&client.includes("tsv:recognized.tsv")&&client.includes("validation:recognized.validation")&&client.includes("metrics:recognized.metrics"),"Archivo debe persistir la evidencia OCR y la validación");
must(archiveApi.includes("validateReceiptFinancials")&&archiveApi.includes('method.startsWith("image_ocr_receipt_")')&&archiveApi.includes("validation.status"),"La API debe impedir que un OCR contradictorio se persista como complete");

must(baseOcr.includes("documentType!==\"receipt\"")&&!baseOcr.includes("Hora"),"El extractor de tickets no debe caer al mayor decimal arbitrario");
must(baseOcr.includes("tel[eé]fono")&&baseOcr.includes("raz[oó]n\\s+social"),"Razón social, dirección y teléfono deben excluirse como nombre comercial");
must(baseOcr.includes("tomorrow")&&baseOcr.includes("documentType===\"receipt\""),"Las fechas futuras imposibles de tickets deben rechazarse");
must(client.includes('type ActionKind=')&&!client.includes("const [busy,setBusy]"),"Archivo no debe bloquear todos los botones con un busy global");
must(client.includes('"Guardando…":"Guardar cambios"')&&client.includes("applyDetail(body.document)"),"Guardar cambios debe actualizar localmente con feedback específico");
must(!client.includes('await refresh();await openDocument(detail.id)'),"Guardar no debe recargar lista y detalle tras PATCH");
must(controls.includes(".primary-action{")&&controls.includes("background:var(--accent)"),"Guardar cambios debe usar control principal global");
must(client.includes("<th>Descripción</th><th>Ud.</th><th>Precio</th><th>Importe</th>"),"El ticket debe mostrar columnas reales");
must(client.includes("coherencia aritmética"),"La UI debe explicar la validación aritmética");
must(css.includes(".receipt-table{")&&css.includes(".receipt-table-wrap{"),"Las columnas del ticket deben ser responsive");
must(archiveLib.includes("p_include_archived:true"),"Archivo debe cargar biblioteca única");
must(!client.includes("Mover a Archivados")&&!client.includes("Restaurar a Activos")&&!client.includes("archive-view-switch"),"Archivo no debe separar Activos/Archivados");
must(client.includes("Biblioteca única")&&client.includes("Eliminar documento"),"Archivo debe ofrecer biblioteca única y eliminación directa");
must(!archiveApi.includes("archive_before_delete")&&!archiveApi.includes('request.nextUrl.searchParams.get("permanent")'),"Eliminar no debe depender de archivado");
must(archiveApi.indexOf('financial_app_archive_delete')<archiveApi.indexOf('.storage.from("financial-app-documents").remove'),"La fila debe borrarse antes del cleanup físico");
must(archiveApi.includes("storageCleanupPending"),"Un fallo físico no debe resucitar la ficha documental");
const versionMatch=appVersion.match(/APP_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);
must(Boolean(versionMatch),"APP_VERSION debe ser semántica");
must(manifest.includes("APP_VERSION")&&manifest.includes("versión ${APP_VERSION}"),"El manifest PWA debe derivar de APP_VERSION");
must(proxy.includes("webmanifest"),"El manifest PWA debe quedar fuera de autenticación");
must(nextConfig.includes("public, max-age=0, must-revalidate"),"El manifest no debe mantener versión obsoleta en caché");
must(settings.includes("version:APP_VERSION"),"Configuración debe mostrar APP_VERSION");
must(css.includes("width:min(920px"),"La revisión documental debe conservar ancho usable");
must(css.includes(".receipt-paper")&&client.includes("Vista reconstruida del ticket"),"La reconstrucción debe seguir presentándose como ticket");
console.log(`audit-ticket-ocr-v302 OK · OCR local canónico integrity v5 · RAW + geometría + validación financiera · ${versionMatch?.[0]||"APP_VERSION"}`);
