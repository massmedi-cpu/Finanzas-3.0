import assert from "node:assert/strict";
import { estimateDeskewFromSamples } from "../lib/document/receipt-image-preprocessor";

type Point = { x: number; y: number };

function receiptRows(angleDegrees: number, width = 600, height = 900) {
  const slope = Math.tan((angleDegrees * Math.PI) / 180);
  const points: Point[] = [];
  const rows = 24;
  const perRow = 54;
  for (let row = 0; row < rows; row += 1) {
    const baseY = 45 + row * ((height - 90) / Math.max(1, rows - 1));
    for (let column = 0; column < perRow; column += 1) {
      const x = 45 + column * ((width - 90) / Math.max(1, perRow - 1));
      const jitter = ((row * 17 + column * 13) % 7 - 3) * 0.22;
      points.push({ x, y: baseY + slope * (x - width / 2) + jitter });
    }
  }
  return points;
}

function backgroundNoise(count: number, width = 600, height = 900) {
  let state = 0x6d2b79f5;
  const points: Point[] = [];
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  for (let index = 0; index < count; index += 1) {
    points.push({ x: next() * width, y: next() * height });
  }
  return points;
}

assert.equal(
  estimateDeskewFromSamples(receiptRows(0), 600, 900),
  0,
  "un ticket ya horizontal no debe rotarse",
);

assert.equal(
  estimateDeskewFromSamples(receiptRows(3), 600, 900),
  3,
  "filas realmente inclinadas deben recuperar su ángulo geométrico",
);

assert.equal(
  estimateDeskewFromSamples(backgroundNoise(10_000), 600, 900),
  0,
  "ruido/fondo sin estructura de filas no puede provocar una rotación espuria",
);

const noisyTilted = [...receiptRows(2), ...backgroundNoise(3_500)];
assert.equal(
  estimateDeskewFromSamples(noisyTilted, 600, 900),
  2,
  "una inclinación clara debe seguir corrigiéndose aunque exista ruido moderado de fondo",
);

assert.equal(
  estimateDeskewFromSamples(receiptRows(0.25), 600, 900),
  0,
  "una desviación subpíxel/marginal no justifica remuestrear toda la fotografía",
);

console.log("OCR deskew confidence tests OK · inclinación real corregida y rotaciones marginales/ruido rechazados");
