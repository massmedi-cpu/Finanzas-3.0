import fs from "node:fs";

function must(condition,message){if(!condition)throw new Error(message)}
const client=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
const engine=fs.readFileSync("lib/document/ticket-ocr-engine.ts","utf8");
const geometry=fs.readFileSync("lib/document/ticket-ocr-geometry.ts","utf8");
const reconstruction=fs.readFileSync("lib/document/receipt-reconstruction.ts","utf8");
const receiptLayout=fs.readFileSync("lib/document/receipt-layout.ts","utf8");
const realRegression=fs.readFileSync("scripts/receipt-reconstruction-v4-tests.ts","utf8");
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
must(!client.includes("Reprocesar OCR mejorado"),"La experiencia principal no debe obligar a reprocesar manualmente el OCR");
must(client.includes("OCR automático completado"),"La interfaz debe dejar claro que el OCR termina durante la importación");
must(client.includes('CURRENT_RECEIPT_OCR_PREFIX="image_ocr_receipt_v501:canonical_v4:"')&&client.includes("needsOcrUpgrade")&&client.includes("upgradeExistingOcr")&&client.includes("startsWith(CURRENT_RECEIPT_OCR_PREFIX)"),"Los tickets guardados con una revisión OCR anterior deben actualizarse automáticamente al abrirlos");
must(client.includes("No necesitas volver a subir la foto"),"La actualización del OCR anterior no debe exigir nueva importación manual");
must(client.includes("sharedWorkerPromise")&&client.includes("workerReuse:true"),"El worker OCR debe reutilizarse entre lecturas para no pagar la inicialización en cada ticket");
must(tsconfig.includes('"@/lib/document/ticket-ocr": ["./lib/document/ticket-ocr-engine"]'),"La app debe importar OCR mediante alias estable");

for(const token of ["paperGeometry","rectify","deskew","localAdaptiveThreshold","canonical_adaptive_psm6","canonical_gray_psm4","reconstructReceiptEvidence","image_ocr_receipt_v501:canonical_v4"])
  must(engine.includes(token),`El motor OCR canónico debe incluir ${token}`);
must(engine.includes('from "./ticket-ocr-geometry"')&&engine.includes('from "./receipt-reconstruction"'),"El motor canónico debe reutilizar primitivas estables y una única reconstrucción por evidencia");
must(!engine.includes("locator_money_columns_psm6")&&!engine.includes("fastcrop_adaptive_psm6")&&!engine.includes("fastcrop_gray_psm6"),"No debe sobrevivir el pipeline fastcrop paralelo ni una pasada OCR usada solo como localizador");
must(!fs.existsSync("lib/document/ticket-ocr-v307.ts"),"No debe reaparecer un motor OCR runtime versionado");
must(engine.includes("detectReceiptTextBounds")&&!engine.includes("geometryReceiptPass")&&!engine.includes("totalsZonePass"),"Las garantías públicas históricas deben conservarse sin motores paralelos runtime");

for(const token of ["mergeAlignedDescriptions","numericAgreement","explicitTotals","cleanReceiptMerchant","reconstructReceiptEvidence"])
  must(reconstruction.includes(token),`La reconstrucción por evidencia debe incluir ${token}`);
must(reconstruction.includes("q.value * unit.value")&&reconstruction.includes("itemSum"),"Las filas y el total deben validarse por coherencia aritmética");
must(realRegression.includes("Ávila")&&realRegression.includes('assert.equal(rebuilt.layout.items.length, 5')&&realRegression.includes('assert.equal(rebuilt.total, 17.5'),"El caso real Ávila debe proteger cinco líneas y total 17,50");
must(String(pkg.scripts?.["test:ocr"]||"").includes("receipt-reconstruction-v4-tests.ts"),"El caso real debe ejecutarse en el test OCR de CI");

must(geometry.includes("localAdaptiveThreshold")&&geometry.includes('"adaptive_local_psm6"'),"La capa de compatibilidad debe conservar umbral local continuo y PSM6");
must(geometry.includes("shouldRefineReceiptCandidates")&&geometry.includes("estimatedTableRows")&&geometry.includes('"adaptive_columns_psm4"'),"La compatibilidad histórica debe seguir respondiendo a filas realmente ausentes");
must(geometry.includes("summaryZone")&&geometry.includes("extractReceiptTotal")&&geometry.includes("reconcileReceiptSummary"),"Base/IVA/Total deben conservar lectura focalizada y reconciliación aritmética segura como fallback");
must(geometry.includes("parseReceiptTsvLayout")&&geometry.includes("receiptLayoutToText")&&geometry.includes("image_ocr_receipt_v501:"),"La reconstrucción geométrica de compatibilidad debe seguir disponible");
must(receiptLayout.includes("inferredQuantity")&&receiptLayout.includes("U[DO0]S"),"Las columnas deben sobrevivir a cabeceras OCR imperfectas y recuperar cantidades solo por aritmética válida");
must(engine.includes("mergeReceiptTexts")&&engine.includes("numericSignature")&&engine.includes("lineQuality")&&engine.includes("lexicalOverlap"),"El consenso textual debe permanecer como fallback");
must(geometry.includes("reconstructTsvReceipt")&&geometry.includes("tsv: true"),"La base geométrica debe usar posiciones y confianza TSV");
must(geometry.includes("estimateDeskewFromSamples")&&geometry.includes("function deskew("),"La base OCR debe conservar enderezado como fallback");
must(geometry.includes("function paperGeometry(")&&geometry.includes("function rectify("),"La corrección de perspectiva histórica debe permanecer disponible");

must(baseOcr.includes("documentType!==\"receipt\"")&&!baseOcr.includes("Hora"),"El extractor de tickets no debe caer al mayor decimal arbitrario");
must(baseOcr.includes("tel[eé]fono")&&baseOcr.includes("raz[oó]n\\s+social"),"Razón social, dirección y teléfono deben excluirse como nombre comercial");
must(baseOcr.includes("tomorrow")&&baseOcr.includes("documentType===\"receipt\""),"Las fechas futuras imposibles de tickets deben rechazarse");
must(client.includes('type ActionKind=')&&!client.includes("const [busy,setBusy]"),"Archivo no debe bloquear todos los botones con un busy global");
must(client.includes('"Guardando…":"Guardar cambios"')&&client.includes("applyDetail(body.document)"),"Guardar cambios debe actualizar localmente con feedback específico");
must(!client.includes('await refresh();await openDocument(detail.id)'),"Guardar no debe recargar lista y detalle tras PATCH");
must(controls.includes(".primary-action{")&&controls.includes("background:var(--accent)"),"Guardar cambios debe usar control principal global");
must(receiptLayout.includes("parseReceiptTsvLayout")&&receiptLayout.includes("ReceiptLineItem")&&receiptLayout.includes('source?:"text"|"geometry_tsv"'),"La reconstrucción debe distinguir estructura de ticket");
must(client.includes("<th>Descripción</th><th>Ud.</th><th>Precio</th><th>Importe</th>"),"El ticket debe mostrar columnas reales");
must(client.includes("Reconstrucción validada del ticket")&&client.includes("coherencia aritmética"),"La UI debe explicar que la reconstrucción se valida cruzando evidencias, no simulando texto");
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
console.log(`audit-ticket-ocr-v302 OK · OCR local canónico v4 · evidencia + aritmética · auto-upgrade · producto ${versionMatch?.[0]||"APP_VERSION"}`);
