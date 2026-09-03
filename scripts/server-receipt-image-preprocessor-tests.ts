import assert from "node:assert/strict";
import fs from "node:fs";
import { createCanvas } from "@napi-rs/canvas/node-canvas";
import {
  prepareServerReceiptImageBytes,
  serverJpegExifOrientation,
  serverReceiptOcrSize,
} from "../lib/document/server-receipt-image-preprocessor";
import { readServerImageMetadata } from "../lib/document/server-image-metadata";

function jpeg(canvas: ReturnType<typeof createCanvas>) {
  return Buffer.from(canvas.toBuffer("image/jpeg", { quality: 0.96 }));
}

function addExifOrientation(source: Buffer, orientation: number) {
  assert.equal(source.readUInt16BE(0), 0xffd8);
  const payload = Buffer.from([
    0x45,0x78,0x69,0x66,0x00,0x00,
    0x49,0x49,0x2a,0x00,0x08,0x00,0x00,0x00,
    0x01,0x00,
    0x12,0x01,0x03,0x00,0x01,0x00,0x00,0x00,orientation,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,
  ]);
  const length = payload.byteLength + 2;
  const app1 = Buffer.concat([Buffer.from([0xff,0xe1,(length>>8)&0xff,length&0xff]),payload]);
  return Buffer.concat([source.subarray(0,2),app1,source.subarray(2)]);
}

assert.deepEqual(serverReceiptOcrSize(520,1040),{width:1000,height:2000},"Drive debe recuperar la misma densidad de una captura pequeña que cámara/galería");
assert.deepEqual(serverReceiptOcrSize(300,600),{width:600,height:1200},"el aumento servidor debe conservar el límite 2x");
assert.deepEqual(serverReceiptOcrSize(4080,3072),{width:3400,height:2560},"las fotos grandes deben conservar el mismo techo de 3400px");
assert.deepEqual(serverReceiptOcrSize(1600,1200),{width:1600,height:1200},"una imagen con densidad adecuada no debe reescalarse");

const photo=createCanvas(800,1200);
const ctx=photo.getContext("2d");
ctx.fillStyle="#303740";ctx.fillRect(0,0,800,1200);
ctx.fillStyle="#d9d6cc";
ctx.beginPath();ctx.moveTo(155,38);ctx.lineTo(640,72);ctx.lineTo(692,1135);ctx.lineTo(112,1104);ctx.closePath();ctx.fill();
ctx.fillStyle="#292929";
for(let y=125;y<1030;y+=48){
  const ratio=(y-38)/(1135-38);
  const left=155+(112-155)*ratio;
  const right=640+(692-640)*ratio;
  ctx.fillRect(left+42,y,Math.max(80,(right-left)-92),4);
}
// Superficie clara vecina con trazos: no debe fundirse con el ticket.
ctx.fillStyle="#dcdcdc";ctx.fillRect(718,170,70,760);
ctx.fillStyle="#555";for(let y=190;y<910;y+=31)ctx.fillRect(728,y,50,3);
const photoBytes=jpeg(photo);
const isolated=await prepareServerReceiptImageBytes(photoBytes,"image/jpeg");
assert.equal(isolated.paperDetected,true,"Drive debe aislar físicamente un ticket fotografiado antes de Tesseract");
assert.equal(isolated.preprocessed,true);
assert.ok(isolated.outputWidth<760&&isolated.outputWidth>350,"el resultado debe ser el papel, no la foto completa con fondo");
assert.ok(isolated.outputHeight>850,"la rectificación debe conservar la extensión vertical del ticket");
assert.equal(isolated.mimeType,"image/jpeg");
const isolatedMeta=readServerImageMetadata(isolated.bytes);
assert.ok(isolatedMeta&&isolatedMeta.width===isolated.outputWidth&&isolatedMeta.height===isolated.outputHeight,"las dimensiones declaradas deben coincidir con los bytes realmente enviados a Tesseract");

const compressed=createCanvas(520,1040);
const compressedCtx=compressed.getContext("2d");
compressedCtx.fillStyle="#245e8a";compressedCtx.fillRect(0,0,520,1040);
const compressedBytes=jpeg(compressed);
const expanded=await prepareServerReceiptImageBytes(compressedBytes,"image/jpeg");
assert.equal(expanded.paperDetected,false,"un fondo coloreado sin papel no debe inventar un recorte");
assert.equal(expanded.outputWidth,1000);
assert.equal(expanded.outputHeight,2000);
assert.equal(expanded.scaled,true);
assert.notDeepEqual(expanded.bytes,compressedBytes,"una imagen pequeña de Drive debe ganar densidad antes de OCR");

const normal=createCanvas(1600,1200);
const normalCtx=normal.getContext("2d");
normalCtx.fillStyle="#245e8a";normalCtx.fillRect(0,0,1600,1200);
const normalBytes=jpeg(normal);
const unchanged=await prepareServerReceiptImageBytes(normalBytes,"image/jpeg");
assert.equal(unchanged.paperDetected,false);
assert.equal(unchanged.preprocessed,false,"si no hay papel, rotación ni cambio de tamaño, Drive debe conservar los bytes originales");
assert.equal(unchanged.bytes,normalBytes,"el fallback no destructivo debe evitar una recompresión innecesaria");

const exifBase=createCanvas(1200,1600);
const exifCtx=exifBase.getContext("2d");
exifCtx.fillStyle="#245e8a";exifCtx.fillRect(0,0,1200,1600);
const exifBytes=addExifOrientation(jpeg(exifBase),6);
assert.equal(serverJpegExifOrientation(exifBytes,"image/jpeg"),6,"el servidor debe detectar la misma orientación EXIF problemática que el navegador");
const flattened=await prepareServerReceiptImageBytes(exifBytes,"image/jpeg");
assert.equal(flattened.orientationFlattened,true,"un JPEG Drive con EXIF no vertical debe rasterizarse antes de OCR");
assert.equal(flattened.preprocessed,true);
assert.notDeepEqual(flattened.bytes,exifBytes,"los bytes EXIF rotados no pueden enviarse directamente a Tesseract");

const canonical=fs.readFileSync("lib/document/server-canonical-receipt.ts","utf8");
const hydration=fs.readFileSync("lib/document/drive-content-hydration.ts","utf8");
const config=fs.readFileSync("next.config.ts","utf8");
const lock=fs.readFileSync("package-lock.json","utf8");
assert.ok(canonical.includes("prepareServerReceiptImageBytes"),"el OCR canónico servidor debe ejecutar el acondicionamiento antes de Tesseract");
assert.ok(canonical.includes("withServerPreparation"),"la procedencia debe registrar el preprocesado servidor real");
assert.ok(hydration.includes("recognizeCanonicalReceiptBytes(bytes"),"Drive debe seguir entrando por el OCR canónico compartido");
assert.ok(config.includes("'./node_modules/@napi-rs/canvas/**/*'"),"/api/sync debe trazar el canvas servidor usado por Drive");
assert.ok(lock.includes('"node_modules/@napi-rs/canvas"')&&lock.includes('"version": "1.0.7"'),"el canvas servidor debe estar fijado en el lockfile reproducible");

console.log("server receipt image preprocessing tests OK · Drive y cámara comparten aislamiento, orientación y densidad antes de una sola inferencia");
