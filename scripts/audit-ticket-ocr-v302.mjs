import fs from "node:fs";

function must(condition,message){if(!condition)throw new Error(message)}

const client=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
const engine=fs.readFileSync("lib/document/ticket-ocr-engine.ts","utf8");
const rectified=fs.readFileSync("lib/document/ticket-ocr-v307.ts","utf8");
const receiptLayout=fs.readFileSync("lib/document/receipt-layout.ts","utf8");
const archiveLib=fs.readFileSync("lib/financial/archive.ts","utf8");
const archiveApi=fs.readFileSync("app/api/archive/[id]/route.ts","utf8");
const tsconfig=fs.readFileSync("tsconfig.json","utf8");
const css=fs.readFileSync("app/archive.css","utf8");
const controls=fs.readFileSync("app/controls.css","utf8");
const appVersion=fs.readFileSync("lib/app-version.ts","utf8");
const manifest=fs.readFileSync("app/manifest.ts","utf8");
const settings=fs.readFileSync("lib/financial/settings.ts","utf8");
const proxy=fs.readFileSync("proxy.ts","utf8");

must(client.includes('recognizeTicketImage(file,worker,onProgress,hint)'),"Archivo debe usar el motor OCR canónico para imágenes");
must(client.includes('upload(e.target.files[0],"receipt")'),"Cámara y galería deben iniciar OCR de ticket automáticamente");
must(client.includes("automaticOnImport:true"),"El resultado OCR debe registrar que se ejecutó automáticamente al importar");
must(!client.includes("Reprocesar OCR mejorado"),"La experiencia principal no debe obligar a reprocesar manualmente el OCR");
must(client.includes("OCR automático completado al importar"),"La interfaz debe dejar claro que el OCR termina durante la importación");
must(tsconfig.includes('"@/lib/document/ticket-ocr": ["./lib/document/ticket-ocr-engine"]'),"La app debe importar el OCR mediante un alias estable, no una implementación versionada");
must(engine.includes('from "./ticket-ocr-v307"'),"El motor canónico debe conservar la rectificación validada como base interna");
must(engine.includes('tessedit_pageseg_mode: "11"')&&engine.includes("sparse_original_psm11"),"El OCR automático debe ejecutar una lectura complementaria de texto disperso");
must(engine.includes("mergeReceiptTexts")&&engine.includes("consensus_line_merge"),"El OCR debe combinar líneas entre lecturas en lugar de escoger una sola pasada");
must(engine.includes("numericSignature")&&engine.includes("lineQuality")&&engine.includes("lexicalOverlap"),"El consenso debe comparar precios, palabras y calidad de línea");
must(engine.includes("Verificando líneas y nombres del ticket")&&engine.includes("Combinando las lecturas más fiables"),"La mejora de nombres y líneas debe ejecutarse dentro del OCR inicial");
must(engine.includes("image_ocr_receipt_v308:consensus_sparse")&&engine.includes("image_ocr_receipt_v308:rectified_fallback"),"El resultado debe identificar consenso o fallback de forma auditable");
must(rectified.includes("reconstructTsvReceipt")&&rectified.includes("tsv: true"),"La base rectificada debe seguir usando posiciones y confianza TSV");
must(rectified.includes("estimateDeskewFromSamples")&&rectified.includes("function deskew("),"La base OCR debe seguir enderezando tickets");
must(rectified.includes("function paperGeometry(")&&rectified.includes("function rectify("),"La corrección de perspectiva debe permanecer activa");
must(rectified.includes("scoreReceiptCandidate")&&rectified.includes("shouldRefineReceiptCandidates"),"La selección multipasada validada debe permanecer como primera capa");
must(client.includes('type ActionKind=')&&!client.includes("const [busy,setBusy]"),"Archivo no debe bloquear todos los botones con un busy global");
must(client.includes('"Guardando…":"Guardar cambios"')&&client.includes("applyDetail(body.document)"),"Guardar cambios debe actualizar localmente el documento con feedback específico");
must(!client.includes('await refresh();await openDocument(detail.id)'),"Guardar no debe volver a recargar lista y detalle después del PATCH");
must(controls.includes(".primary-action{")&&controls.includes("background:var(--accent)"),"Guardar cambios debe tener un estilo principal disponible globalmente");
must(receiptLayout.includes("parseReceiptLayout")&&receiptLayout.includes("ReceiptLineItem")&&client.includes("receipt-table"),"La reconstrucción debe convertir productos OCR en columnas reales");
must(client.includes("<th>Descripción</th><th>Ud.</th><th>Precio</th><th>Total</th>"),"El ticket debe mostrar columnas Descripción/Ud./Precio/Total");
must(css.includes(".receipt-table{")&&css.includes(".receipt-table-wrap{"),"Las columnas del ticket deben tener layout responsive propio");
must(archiveLib.includes("p_include_archived:true"),"Archivo debe cargar una única biblioteca con todos los documentos existentes");
must(!client.includes("Mover a Archivados")&&!client.includes("Restaurar a Activos")&&!client.includes("archive-view-switch"),"La interfaz no debe separar Activos y Archivados");
must(client.includes("Biblioteca única")&&client.includes("Eliminar documento"),"Archivo debe comunicar la biblioteca única y ofrecer eliminación directa");
must(!archiveApi.includes("archive_before_delete"),"La eliminación directa no debe obligar a archivar antes");
must(appVersion.includes('APP_VERSION = "3.0.5"'),"La versión visible debe seguir sincronizada con package/lockfile durante este refactor");
must(manifest.includes("APP_VERSION")&&manifest.includes("versión ${APP_VERSION}"),"El manifiesto instalado debe derivar de la versión activa");
must(proxy.includes("webmanifest"),"El manifest PWA debe quedar fuera del proxy de autenticación");
must(settings.includes("version:APP_VERSION"),"Configuración debe mostrar la versión del código en ejecución");
must(css.includes("width:min(920px"),"La revisión de documentos debe conservar ancho usable en escritorio");
must(css.includes(".receipt-paper")&&client.includes("Vista reconstruida del ticket"),"La reconstrucción debe seguir presentándose como ticket");

console.log("audit-ticket-ocr-v302 OK · OCR automático · ticket tabulado · biblioteca única");
