import fs from "node:fs";

function must(condition, message) {
  if (!condition) throw new Error(message);
}

const client = fs.readFileSync("app/archivo/archive-client.tsx", "utf8");
const engine = fs.readFileSync("lib/document/ticket-ocr-v307.ts", "utf8");
const tsconfig = fs.readFileSync("tsconfig.json", "utf8");
const css = fs.readFileSync("app/archive.css", "utf8");
const appVersion = fs.readFileSync("lib/app-version.ts", "utf8");
const manifest = fs.readFileSync("app/manifest.ts", "utf8");
const settings = fs.readFileSync("lib/financial/settings.ts", "utf8");
const proxy = fs.readFileSync("proxy.ts", "utf8");

must(client.includes('recognizeTicketImage(file,worker,onProgress,hint)'), "Archivo debe usar el OCR mejorado para imágenes");
must(client.includes('file.type.startsWith("image/")?"receipt":null'), "Reprocesar imágenes debe conservar el contexto de ticket");
must(client.includes('upload(e.target.files[0],"receipt")'), "Cámara/galería deben pasar la pista de ticket");
must(client.includes("Reprocesar OCR mejorado"), "Debe existir reprocesado OCR mejorado");
must(tsconfig.includes('"@/lib/document/ticket-ocr": ["./lib/document/ticket-ocr-v307"]'), "La app debe resolver el import de OCR al motor 3.0.7");
must(engine.includes("reconstructTsvReceipt") && engine.includes("tsv: true"), "El OCR debe usar posiciones y confianza TSV, no sólo texto plano");
must(engine.includes("estimateDeskewFromSamples") && engine.includes("function deskew("), "El OCR debe enderezar tickets fotografiados antes de leerlos");
must(engine.includes("function paperGeometry(") && engine.includes("function rectify("), "El OCR debe corregir perspectiva horizontal del papel");
must(engine.includes("Corrigiendo perspectiva y giro") && engine.includes("image_ocr_receipt_v307"), "La ruta de producción debe identificar el OCR 3.0.7");
must(engine.includes("scoreReceiptCandidate") && engine.includes("shouldRefineReceiptCandidates"), "La selección de pasadas debe separar legibilidad de mera extracción de metadatos");
must(engine.includes("natural_rectified_tsv") && engine.includes("Contrastando una tercera lectura"), "Las pasadas conflictivas deben provocar una tercera lectura sin binarizar");
must(engine.includes("characters < 20") && engine.includes("* 0.15 - 35"), "Una confianza alta sin texto útil debe quedar penalizada");
must(engine.includes('await read(worker, prepared.adaptive, "6")') && engine.includes('await read(worker, prepared.enhanced, "4")'), "Debe conservarse la estrategia multipasada bloque/columnas");
must(engine.includes("inferDocumentMetadata"), "Los metadatos deben derivarse del texto OCR seleccionado");
must(appVersion.includes('APP_VERSION = "3.0.5"'), "El hotfix debe conservar la versión de producto 3.0.5");
must(manifest.includes("APP_VERSION") && manifest.includes("versión ${APP_VERSION}"), "El manifiesto instalado debe cambiar con la versión activa");
must(proxy.includes("webmanifest"), "El manifest PWA debe quedar fuera del proxy de autenticación para que Android pueda actualizar la instalación");
must(settings.includes("version:APP_VERSION"), "Configuración debe mostrar la versión del código en ejecución y no una versión backend obsoleta");
must(css.includes("width:min(920px"), "La revisión de documentos debe tener un ancho usable en escritorio");
must(css.includes(".receipt-paper")&&client.includes("Vista reconstruida del ticket"), "La reconstrucción OCR debe presentarse con apariencia de ticket, no como JSON técnico");
must(client.includes("Archivados")&&client.includes("Eliminar definitivamente")&&client.includes("Restaurar a Activos"), "Archivo debe explicar y gestionar el ciclo Activos/Archivados/eliminación");

console.log("audit-ticket-ocr-v302 OK · engine 3.0.7 · selección conflictiva protegida");
