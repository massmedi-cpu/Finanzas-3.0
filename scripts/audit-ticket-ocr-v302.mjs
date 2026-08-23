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
must(engine.includes("imageVariants"), "Debe existir preprocesado local de imagen");
must(engine.includes("otsuThreshold"), "Debe existir binarización automática");
must(engine.includes('tessedit_pageseg_mode'), "Debe probarse segmentación OCR específica");
must(engine.includes('"enhanced_block"') && engine.includes('"binary_sparse"'), "Debe haber estrategias OCR alternativas");
must(engine.includes("candidateScore"), "Debe seleccionarse la mejor lectura por calidad y metadatos");
must(engine.includes("inferDocumentMetadata"), "Los metadatos deben derivarse del texto OCR seleccionado");
must(css.includes("width:min(920px"), "La revisión de documentos debe tener un ancho usable en escritorio");
must(!client.includes("worker.recognize(file);text=String(recognized.data?.text"), "No debe volver el OCR crudo de una sola pasada");

console.log("audit-ticket-ocr-v302 OK");
