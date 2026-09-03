import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas/node-canvas";
import { detectPaper } from "../lib/document/receipt-image-preprocessor";

function detectionData(canvas: ReturnType<typeof createCanvas>) {
  const context = canvas.getContext("2d");
  return context.getImageData(0, 0, canvas.width, canvas.height) as unknown as ImageData;
}

function averageWidth(geometry: NonNullable<ReturnType<typeof detectPaper>>) {
  return ((geometry.topRight - geometry.topLeft) + (geometry.bottomRight - geometry.bottomLeft)) / 2;
}

function averageCenter(geometry: NonNullable<ReturnType<typeof detectPaper>>) {
  return (geometry.topLeft + geometry.topRight + geometry.bottomLeft + geometry.bottomRight) / 4;
}

function drawRows(
  canvas: ReturnType<typeof createCanvas>,
  left: number,
  right: number,
  top: number,
  bottom: number,
  spacing: number,
  shade: string,
) {
  const context = canvas.getContext("2d");
  context.fillStyle = shade;
  for (let y = top; y < bottom; y += spacing) {
    context.fillRect(left, y, Math.max(1, right - left), 4);
  }
}

// Caso realista: ticket central y otra hoja/menú más brillante a la derecha.
// El detector de bordes no puede formar un rectángulo híbrido usando el borde
// izquierdo del ticket y el borde derecho del papel vecino.
const competing = createCanvas(1200, 1600);
const competingCtx = competing.getContext("2d");
competingCtx.fillStyle = "#242a31";
competingCtx.fillRect(0, 0, competing.width, competing.height);
competingCtx.fillStyle = "#c7c5bd";
competingCtx.fillRect(220, 70, 490, 1460);
drawRows(competing, 270, 650, 150, 1450, 54, "#353535");
competingCtx.fillStyle = "#f2f2ed";
competingCtx.fillRect(785, 170, 370, 1260);
drawRows(competing, 820, 1120, 220, 1380, 38, "#515151");
const competingGeometry = detectPaper(detectionData(competing), competing.width, competing.height);
assert.ok(competingGeometry, "debe localizar el ticket aunque haya otra hoja clara al lado");
assert.ok(averageWidth(competingGeometry) < 650, "no debe fusionar ticket y papel vecino en un único recorte ancho");
assert.ok(averageCenter(competingGeometry) < 700, "debe conservar el componente físico del ticket y excluir el menú lateral");

// Dos papeles equivalentes y separados son una escena realmente ambigua. Sin
// evidencia para decidir cuál es el documento, es más seguro no recortar que
// entregar a Tesseract una mezcla o cortar arbitrariamente uno de ellos.
const ambiguous = createCanvas(1200, 1600);
const ambiguousCtx = ambiguous.getContext("2d");
ambiguousCtx.fillStyle = "#252b32";
ambiguousCtx.fillRect(0, 0, ambiguous.width, ambiguous.height);
ambiguousCtx.fillStyle = "#deddd7";
ambiguousCtx.fillRect(90, 90, 430, 1420);
ambiguousCtx.fillRect(680, 90, 430, 1420);
drawRows(ambiguous, 135, 475, 160, 1450, 52, "#383838");
drawRows(ambiguous, 725, 1065, 160, 1450, 52, "#383838");
assert.equal(
  detectPaper(detectionData(ambiguous), ambiguous.width, ambiguous.height),
  null,
  "dos componentes de papel igualmente plausibles deben fallar cerrado en vez de inventar un recorte",
);

// El detector de bordes sigue siendo necesario como fallback para papel gris
// o térmico que no supera el umbral de superficie clara.
const gray = createCanvas(1100, 1600);
const grayCtx = gray.getContext("2d");
grayCtx.fillStyle = "#20262c";
grayCtx.fillRect(0, 0, gray.width, gray.height);
grayCtx.fillStyle = "#7d7d79";
grayCtx.fillRect(250, 70, 600, 1460);
drawRows(gray, 300, 800, 150, 1450, 57, "#303030");
const grayGeometry = detectPaper(detectionData(gray), gray.width, gray.height);
assert.ok(grayGeometry, "el fallback por bordes debe seguir detectando tickets grises");
assert.ok(averageWidth(grayGeometry) > 480 && averageWidth(grayGeometry) < 720, "el fallback gris debe conservar la anchura física del papel");

// Una sombra longitudinal puede dejar la parte superior por encima del umbral
// de superficie clara y oscurecer la mitad inferior sin romper los bordes
// físicos del mismo ticket. La detección luminosa aislada truncaría el papel en
// la sombra; la geometría final debe conservar la extensión completa demostrada
// por los bordes largos del mismo componente.
const shadowed = createCanvas(1100, 1800);
const shadowedCtx = shadowed.getContext("2d");
shadowedCtx.fillStyle = "#20262c";
shadowedCtx.fillRect(0, 0, shadowed.width, shadowed.height);
shadowedCtx.fillStyle = "#deddd7";
shadowedCtx.fillRect(250, 70, 600, 790);
shadowedCtx.fillStyle = "#9f9f9b";
shadowedCtx.fillRect(250, 860, 600, 870);
drawRows(shadowed, 300, 800, 150, 790, 55, "#343434");
drawRows(shadowed, 300, 800, 920, 1660, 55, "#343434");
const shadowedGeometry = detectPaper(detectionData(shadowed), shadowed.width, shadowed.height);
assert.ok(shadowedGeometry, "un ticket con sombra longitudinal debe seguir detectándose como un solo papel");
assert.ok(shadowedGeometry.top < 150, "la geometría con sombra debe conservar la cabecera del papel");
assert.ok(shadowedGeometry.bottom > 1550, "la geometría con sombra debe conservar también la mitad inferior y el pie");
assert.ok(shadowedGeometry.bottom - shadowedGeometry.top > 1400, "la sombra no puede convertir un ticket completo en un recorte parcial");

// Un ticket ya recortado hasta los bordes no se rechaza por tocar el marco de
// la imagen. La penalización de borde es evidencia, no una prohibición.
const cropped = createCanvas(720, 1450);
const croppedCtx = cropped.getContext("2d");
croppedCtx.fillStyle = "#d8d6cf";
croppedCtx.fillRect(0, 0, cropped.width, cropped.height);
drawRows(cropped, 45, 675, 90, 1370, 51, "#333333");
const croppedGeometry = detectPaper(detectionData(cropped), cropped.width, cropped.height);
assert.ok(croppedGeometry, "un ticket correctamente recortado que toca bordes debe seguir siendo válido");

console.log("OCR paper candidate arbitration tests OK · papel vecino excluido, ambigüedad fail-closed, sombra longitudinal íntegra y fallback gris preservado");