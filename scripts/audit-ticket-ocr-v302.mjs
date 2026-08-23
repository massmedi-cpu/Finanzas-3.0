import fs from "node:fs";

function must(condition, message) {
  if (!condition) throw new Error(message);
}

const client = fs.readFileSync("app/archivo/archive-client.tsx", "utf8");
const engine = fs.readFileSync("lib/document/ticket-ocr-v305.ts", "utf8");
const tsconfig = fs.readFileSync("tsconfig.json", "utf8");
const css = fs.readFileSync("app/archive.css", "utf8");

must(client.includes('recognizeTicketImage(file,worker,onProgress,hint)'), "Archivo debe usar el OCR mejorado para imágenes");
must(client.includes('file.type.startsWith("image/")?"receipt":null'), "Reprocesar imágenes debe conservar el contexto de ticket");
must(client.includes('upload(e.target.files[0],"receipt")'), "Cámara/galería deben pasar la pista de ticket");
must(client.includes("Reprocesar OCR mejorado"), "Debe existir reprocesado OCR mejorado");
must(tsconfig.includes('"@/lib/document/ticket-ocr": ["./lib/document/ticket-ocr-v305"]'), "La app debe resolver el import de OCR al motor 3.0.5");
must(engine.includes("reconstructTsvReceipt") && engine.includes("tsv:true"), "El OCR debe usar posiciones y confianza TSV, no sólo texto plano");
must(engine.includes("const adaptive=new Uint8ClampedArray(gray)") && engine.includes('variant:"adaptive_tsv"') && engine.includes("contraste adaptativo"), "Debe existir umbral adaptativo y una pasada OCR específica para tickets fotografiados");
must(engine.includes("bounds(") && engine.includes("Detectando el papel del ticket"), "Debe recortarse el papel antes del OCR");
must(engine.includes('tessedit_pageseg_mode'), "Debe probarse segmentación OCR específica");
must(engine.includes('v.adaptive,"6"') && engine.includes('v.enhanced,"4"'), "Debe haber estrategias OCR alternativas para bloque y columnas");
must(engine.includes("inferDocumentMetadata"), "Los metadatos deben derivarse del texto OCR seleccionado");
must(css.includes("width:min(920px"), "La revisión de documentos debe tener un ancho usable en escritorio");
must(css.includes(".receipt-paper")&&client.includes("Vista reconstruida del ticket"), "La reconstrucción OCR debe presentarse con apariencia de ticket, no como JSON técnico");
must(client.includes("Archivados")&&client.includes("Eliminar definitivamente")&&client.includes("Restaurar a Activos"), "Archivo debe explicar y gestionar el ciclo Activos/Archivados/eliminación");

console.log("audit-ticket-ocr-v302 OK");
