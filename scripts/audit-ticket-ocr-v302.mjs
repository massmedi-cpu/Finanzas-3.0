import fs from "node:fs";

function must(condition, message) {
  if (!condition) throw new Error(message);
}

const client = fs.readFileSync("app/archivo/archive-client.tsx", "utf8");
const engine = fs.readFileSync("lib/document/ticket-ocr.ts", "utf8");
const css = fs.readFileSync("app/archive.css", "utf8");

must(client.includes('recognizeTicketImage(file,worker,onProgress,hint)'), "Archivo debe usar el OCR mejorado para imágenes");
must(client.includes('file.type.startsWith("image/")?"receipt":null'), "Reprocesar imágenes debe conservar el contexto de ticket");
must(client.includes('upload(e.target.files[0],"receipt")'), "Cámara/galería deben pasar la pista de ticket");
must(client.includes("Reprocesar OCR mejorado"), "Debe existir reprocesado OCR mejorado");
must(engine.includes("imageVariants")&&engine.includes("detectReceiptBounds"), "Debe existir detección, recorte y preprocesado local del ticket");
must(engine.includes("otsuThreshold"), "Debe existir binarización automática");
must(engine.includes('tessedit_pageseg_mode'), "Debe probarse segmentación OCR específica");
must(engine.includes('"enhanced_block"')&&engine.includes('"enhanced_column"')&&engine.includes('"binary_sparse"'), "Debe haber estrategias OCR alternativas para bloque, columnas y caracteres difíciles");
must(engine.includes("preserveOcrLayout"), "Debe conservarse el espaciado para reconstruir visualmente el ticket");
must(engine.includes("candidateScore"), "Debe seleccionarse la mejor lectura por calidad y metadatos");
must(engine.includes("inferDocumentMetadata"), "Los metadatos deben derivarse del texto OCR seleccionado");
must(css.includes("width:min(920px"), "La revisión de documentos debe tener un ancho usable en escritorio");
must(css.includes(".receipt-paper")&&client.includes("Vista reconstruida del ticket"), "La reconstrucción OCR debe presentarse con apariencia de ticket, no como JSON técnico");
must(client.includes("Archivados")&&client.includes("Eliminar definitivamente")&&client.includes("Restaurar a Activos"), "Archivo debe explicar y gestionar el ciclo Activos/Archivados/eliminación");
must(!client.includes("worker.recognize(file);text=String(recognized.data?.text"), "No debe volver el OCR crudo de una sola pasada");

console.log("audit-ticket-ocr-v302 OK");
