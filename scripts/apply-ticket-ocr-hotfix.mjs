import fs from "node:fs";

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`No se encontró bloque: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) throw new Error(`Bloque ambiguo: ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

const clientPath = "app/archivo/archive-client.tsx";
let client = fs.readFileSync(clientPath, "utf8");
client = replaceOnce(
  client,
  'import { madridToday } from "@/lib/time/madrid";\n',
  'import { madridToday } from "@/lib/time/madrid";\nimport { inferDocumentMetadata, recognizeTicketImage, type DocumentTypeHint } from "@/lib/document/ticket-ocr";\n',
  "import OCR",
);

const metadataStart = client.indexOf("function parseEuro(raw:string)");
const runStart = client.indexOf("async function runOcr(", metadataStart);
if (metadataStart < 0 || runStart < 0) throw new Error("No se encontró el bloque antiguo de metadatos OCR");
client = client.slice(0, metadataStart) + client.slice(runStart);

client = replaceOnce(
  client,
  'async function runOcr(file:File,onProgress:(value:number,label:string)=>void):Promise<OcrResult>{\n  onProgress(.03,"Preparando documento");let text="";let method="image_ocr";let pages=1;let confidence:number|null=null;let worker:any=null;',
  'async function runOcr(file:File,onProgress:(value:number,label:string)=>void,hint:DocumentTypeHint=null):Promise<OcrResult>{\n  onProgress(.03,"Preparando documento");let text="";let method="image_ocr";let pages=1;let confidence:number|null=null;let passes:Array<{variant:string;confidence:number|null;score:number}>=[];let worker:any=null;',
  "firma runOcr",
);

client = replaceOnce(
  client,
  '    }else{\n      worker=await makeWorker(onProgress);const recognized=await worker.recognize(file);text=String(recognized.data?.text||"");confidence=Number.isFinite(recognized.data?.confidence)?Number(recognized.data.confidence):null;onProgress(.96,"Interpretando datos");\n    }\n    if(!text.trim())throw new Error("No se ha podido extraer texto del documento");const meta=inferMetadata(text);const reconstruction={generated:true,label:"Generado automáticamente mediante OCR. Puede contener errores.",engine:method==="pdf_text"?"PDF.js":"Tesseract.js 7.0.0",method,documentType:meta.documentType,documentDate:meta.documentDate,amount:meta.amount,merchant:meta.merchant,previewLines:meta.lines.slice(0,80)};\n    onProgress(1,"OCR completado");return{text,status:"complete",data:{engine:method==="pdf_text"?"PDF.js 6.2.108":"Tesseract.js 7.0.0",method,pages,confidence,language:"spa",localProcessing:true,assetOrigin:"same-origin",processedAt:new Date().toISOString()},reconstruction,documentType:meta.documentType,documentDate:meta.documentDate,amount:meta.amount,merchant:meta.merchant};',
  '    }else{\n      worker=await makeWorker(onProgress);const recognized=await recognizeTicketImage(file,worker,onProgress,hint);text=recognized.text;confidence=recognized.confidence;method=recognized.method;passes=recognized.passes;\n    }\n    if(!text.trim())throw new Error("No se ha podido extraer texto del documento");const meta=inferDocumentMetadata(text,hint);const reconstruction={generated:true,label:"Generado automáticamente mediante OCR mejorado. Puede contener errores.",engine:method==="pdf_text"?"PDF.js":"Tesseract.js 7.0.0",method,documentType:meta.documentType,documentDate:meta.documentDate,amount:meta.amount,merchant:meta.merchant,previewLines:meta.lines.slice(0,80)};\n    onProgress(1,"OCR completado");return{text,status:"complete",data:{engine:method==="pdf_text"?"PDF.js 6.2.108":"Tesseract.js 7.0.0",method,pages,confidence,passes,language:"spa",localProcessing:true,imagePreprocessing:method.startsWith("image_ocr_multi:"),assetOrigin:"same-origin",processedAt:new Date().toISOString()},reconstruction,documentType:meta.documentType,documentDate:meta.documentDate,amount:meta.amount,merchant:meta.merchant};',
  "OCR de imagen",
);

client = replaceOnce(client, "  async function upload(file:File){", "  async function upload(file:File,hint:DocumentTypeHint=null){", "firma upload");
client = replaceOnce(
  client,
  'const id=String(registration.id);try{const result=await runOcr(file,(value,label)=>{setProgress(value);setProgressLabel(label)});',
  'const id=String(registration.id);try{const result=await runOcr(file,(value,label)=>{setProgress(value);setProgressLabel(label)},hint);',
  "runOcr upload",
);
client = replaceOnce(
  client,
  'setMessage("Documento guardado y procesado mediante OCR local.")',
  'setMessage("Documento guardado y leído con OCR mejorado. Revisa fecha, importe y comercio antes de vincularlo.")',
  "mensaje OCR",
);

client = replaceOnce(
  client,
  'const result=await runOcr(file,(value,label)=>{setProgress(value);setProgressLabel(label)});const r=await fetch(`/api/archive/${detail.id}`',
  'const result=await runOcr(file,(value,label)=>{setProgress(value);setProgressLabel(label)},file.type.startsWith("image/")?"receipt":null);const r=await fetch(`/api/archive/${detail.id}`',
  "reprocesado mejorado",
);
client = replaceOnce(client, '>Reprocesar OCR</button>', '>Reprocesar OCR mejorado</button>', "etiqueta reprocesar");

client = replaceOnce(
  client,
  'onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/><input ref={galleryRef}',
  'onChange={e=>e.target.files?.[0]&&upload(e.target.files[0],"receipt")}/><input ref={galleryRef}',
  "cámara ticket",
);
client = replaceOnce(
  client,
  'onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/><input ref={fileRef}',
  'onChange={e=>e.target.files?.[0]&&upload(e.target.files[0],"receipt")}/><input ref={fileRef}',
  "galería ticket",
);

fs.writeFileSync(clientPath, client);

const cssPath = "app/archive.css";
let css = fs.readFileSync(cssPath, "utf8");
css = replaceOnce(css, ".archive-drawer{width:min(720px,100%);", ".archive-drawer{width:min(920px,calc(100vw - 24px));", "ancho drawer");
css += '\n.archive-editor .editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.archive-editor .editor-grid .wide{grid-column:1/-1}.archive-editor textarea{min-height:92px}.archive-editor label.wide textarea[rows="12"]{min-height:260px}.archive-drawer .trace-panel{overflow:hidden}\n@media(max-width:760px){.archive-editor .editor-grid{grid-template-columns:1fr}.archive-editor .editor-grid .wide{grid-column:auto}.archive-drawer{width:100%}}\n';
fs.writeFileSync(cssPath, css);

console.log("Ticket OCR hotfix aplicado correctamente.");
