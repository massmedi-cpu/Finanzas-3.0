import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("app/archivo/archive-client.tsx","utf8");

for(const token of [
  'const pageChunks=Array<string>(pdf.numPages).fill("")',
  'pageChunks[i-1]=pageText',
  'pageChunks[pageNo-1]=String(recognized.data?.text||"").trim()',
  'text=pageChunks.join("\\n\\n").trim()',
  'nativePages.push(i)',
  'scannedPages:scanned',
  'status="needs_review"',
]) assert.ok(source.includes(token),`Falta contrato de orden PDF en Archivo: ${token}`);

assert.ok(!source.includes('chunks.push(String(recognized.data?.text||""))'),"El OCR de páginas escaneadas no puede añadirse al final del PDF mixto");
assert.ok(!source.includes('if(pageText.replace(/\\s/g,"").length>=40)chunks.push(pageText)'),"El texto nativo debe conservar el índice de página original");

const nativeAssign=source.indexOf('pageChunks[i-1]=pageText');
const ocrAssign=source.indexOf('pageChunks[pageNo-1]=String(recognized.data?.text||"").trim()');
const finalJoin=source.indexOf('text=pageChunks.join("\\n\\n").trim()');
assert.ok(nativeAssign>=0&&ocrAssign>nativeAssign&&finalJoin>ocrAssign,"La recomposición debe ocurrir después de rellenar páginas nativas y OCR");

console.log("Archive mixed PDF page-order tests OK · páginas nativas/OCR conservan posición original y OCR visual queda en revisión");