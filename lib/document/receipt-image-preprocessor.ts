export type PreparedReceiptImage = {
  adaptive: HTMLCanvasElement;
  grayscale: HTMLCanvasElement;
  deskewAngle: number;
  perspectiveCorrected: boolean;
  paperDetected: boolean;
  durationMs: number;
};

type PaperGeometry = {
  top: number;
  bottom: number;
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

function detectPaper(data: ImageData, width: number, height: number): PaperGeometry | null {
  const step = Math.max(4, Math.floor(Math.max(width, height) / 700));
  const rows = Math.ceil(height / step);
  const columns = Math.ceil(width / step);
  const minHits = Math.max(4, Math.round(columns * 0.14));
  const spans: Array<{ y: number; left: number; right: number }> = [];

  for (let gridY = 0; gridY < rows; gridY += 1) {
    const y = Math.min(height - 1, gridY * step);
    let hits = 0; let left = width; let right = 0;
    for (let gridX = 0; gridX < columns; gridX += 1) {
      const x = Math.min(width - 1, gridX * step);
      const offset = (y * width + x) * 4;
      const red = data.data[offset]; const green = data.data[offset + 1]; const blue = data.data[offset + 2];
      const high = Math.max(red, green, blue); const low = Math.min(red, green, blue);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const lowSaturation = high - low <= 78;
      if (luminance >= 135 && lowSaturation) {
        hits += 1; left = Math.min(left, x); right = Math.max(right, x);
      }
    }
    if (hits >= minHits && right > left) spans.push({ y, left, right });
  }

  if (spans.length < rows * 0.2) return null;
  const top = spans[0].y; const bottom = spans.at(-1)!.y;
  if (bottom - top < height * 0.38) return null;
  const band = Math.max(4, Math.round(spans.length * 0.14));
  const topBand = spans.slice(0, band); const bottomBand = spans.slice(-band);
  const topLeft = median(topBand.map((span) => span.left));
  const topRight = median(topBand.map((span) => span.right));
  const bottomLeft = median(bottomBand.map((span) => span.left));
  const bottomRight = median(bottomBand.map((span) => span.right));
  const topWidth = topRight - topLeft; const bottomWidth = bottomRight - bottomLeft;
  if (Math.min(topWidth, bottomWidth) < width * 0.3) return null;
  const ratio = Math.max(topWidth, bottomWidth) / Math.max(1, Math.min(topWidth, bottomWidth));
  if (ratio > 1.55) return null;
  return { top, bottom, topLeft, topRight, bottomLeft, bottomRight };
}

function rectifyPaper(source: HTMLCanvasElement, geometry: PaperGeometry | null) {
  if (!geometry) {
    const copy = document.createElement("canvas"); copy.width = source.width; copy.height = source.height;
    copy.getContext("2d")?.drawImage(source, 0, 0);
    return { canvas: copy, corrected: false };
  }
  const sourceHeight = Math.max(1, geometry.bottom - geometry.top);
  const topWidth = geometry.topRight - geometry.topLeft;
  const bottomWidth = geometry.bottomRight - geometry.bottomLeft;
  const targetWidth = Math.max(1, Math.round((topWidth + bottomWidth) / 2));
  const marginX = Math.round(targetWidth * 0.055); const marginY = Math.round(sourceHeight * 0.035);
  const output = document.createElement("canvas"); output.width = targetWidth + marginX * 2; output.height = sourceHeight + marginY * 2;
  const context = output.getContext("2d"); if (!context) throw new Error("Canvas no disponible");
  context.fillStyle = "#fff"; context.fillRect(0, 0, output.width, output.height);
  const strip = Math.max(1, Math.round(sourceHeight / 1200));
  for (let destinationY = 0; destinationY < sourceHeight; destinationY += strip) {
    const ratio = destinationY / Math.max(1, sourceHeight - 1);
    const left = geometry.topLeft + (geometry.bottomLeft - geometry.topLeft) * ratio;
    const right = geometry.topRight + (geometry.bottomRight - geometry.topRight) * ratio;
    const y = geometry.top + destinationY;
    const h = Math.min(strip, sourceHeight - destinationY);
    context.drawImage(source, left, y, Math.max(1, right - left), h, marginX, marginY + destinationY, targetWidth, h);
  }
  const corrected = Math.abs(topWidth - bottomWidth) > Math.max(10, targetWidth * 0.02)
    || Math.abs(geometry.topLeft - geometry.bottomLeft) > Math.max(10, targetWidth * 0.02);
  return { canvas: output, corrected };
}

export function estimateDeskewFromSamples(samples: Array<{ x: number; y: number }>, width: number, height: number) {
  if (samples.length < 80) return 0;
  let bestAngle = 0; let bestScore = -Infinity;
  const step = Math.max(2, Math.round(height / 450));
  for (let angle = -8; angle <= 8; angle += 0.5) {
    const radians = (angle * Math.PI) / 180;
    const cosine = Math.cos(radians); const sine = Math.sin(radians);
    const bins = new Uint32Array(Math.ceil((height + Math.abs(width * sine)) / step) + 8);
    for (const point of samples) {
      const projected = point.y * cosine - point.x * sine + Math.abs(width * sine) + step * 2;
      const index = Math.floor(projected / step);
      if (index >= 0 && index < bins.length) bins[index] += 1;
    }
    let score = 0;
    for (let index = 1; index < bins.length - 1; index += 1) {
      const value = bins[index] * 2 + bins[index - 1] + bins[index + 1];
      score += value * value;
    }
    if (score > bestScore) { bestScore = score; bestAngle = angle; }
  }
  return Math.abs(bestAngle) < 0.4 ? 0 : Math.round(bestAngle * 2) / 2;
}

function deskew(source: HTMLCanvasElement) {
  const maxSide = 900; const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale)); const height = Math.max(1, Math.round(source.height * scale));
  const sample = document.createElement("canvas"); sample.width = width; sample.height = height;
  const context = sample.getContext("2d", { willReadFrequently: true }); if (!context) return { canvas: source, angle: 0 };
  context.drawImage(source, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height); const points: Array<{ x: number; y: number }> = [];
  const stride = Math.max(1, Math.round(Math.max(width, height) / 700));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      const luminance = data.data[offset] * 0.2126 + data.data[offset + 1] * 0.7152 + data.data[offset + 2] * 0.0722;
      if (luminance < 150) points.push({ x, y });
    }
  }
  if (points.length > 18000) {
    const every = Math.ceil(points.length / 18000);
    for (let index = points.length - 1; index >= 0; index -= 1) if (index % every !== 0) points.splice(index, 1);
  }
  const angle = estimateDeskewFromSamples(points, width, height);
  if (!angle) return { canvas: source, angle: 0 };
  const radians = (-angle * Math.PI) / 180; const cosine = Math.abs(Math.cos(radians)); const sine = Math.abs(Math.sin(radians));
  const output = document.createElement("canvas"); output.width = Math.ceil(source.width * cosine + source.height * sine); output.height = Math.ceil(source.height * cosine + source.width * sine);
  const outputContext = output.getContext("2d"); if (!outputContext) return { canvas: source, angle: 0 };
  outputContext.fillStyle = "#fff"; outputContext.fillRect(0, 0, output.width, output.height);
  outputContext.translate(output.width / 2, output.height / 2); outputContext.rotate(radians); outputContext.drawImage(source, -source.width / 2, -source.height / 2);
  return { canvas: output, angle };
}

export function localAdaptiveThreshold(grayscale: Uint8ClampedArray, width: number, height: number) {
  const output = new Uint8ClampedArray(grayscale.length); const stride = width + 1; const integral = new Uint32Array(stride * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let row = 0;
    for (let x = 1; x <= width; x += 1) {
      row += grayscale[((y - 1) * width + (x - 1)) * 4];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
    }
  }
  const radius = clamp(Math.round(Math.min(width, height) / 38), 18, 44); const ratio = 0.92;
  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - radius); const bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius); const right = Math.min(width, x + radius + 1); const area = (right - left) * (bottom - top);
      const sum = integral[bottom * stride + right] - integral[top * stride + right] - integral[bottom * stride + left] + integral[top * stride + left];
      const sourceOffset = (y * width + x) * 4;
      const value = grayscale[sourceOffset] < (sum / Math.max(1, area)) * ratio ? 0 : 255;
      output[sourceOffset] = output[sourceOffset + 1] = output[sourceOffset + 2] = value; output[sourceOffset + 3] = 255;
    }
  }
  return output;
}

function contrastStretch(data: ImageData) {
  const luminances: number[] = [];
  const every = Math.max(1, Math.floor((data.width * data.height) / 30000));
  for (let pixel = 0; pixel < data.width * data.height; pixel += every) {
    const offset = pixel * 4;
    luminances.push(Math.round(data.data[offset] * 0.2126 + data.data[offset + 1] * 0.7152 + data.data[offset + 2] * 0.0722));
  }
  luminances.sort((a, b) => a - b);
  const low = luminances[Math.floor(luminances.length * 0.03)] ?? 0;
  const high = luminances[Math.floor(luminances.length * 0.97)] ?? 255;
  const span = Math.max(40, high - low);
  const grayscale = new Uint8ClampedArray(data.data.length);
  for (let offset = 0; offset < data.data.length; offset += 4) {
    const raw = data.data[offset] * 0.2126 + data.data[offset + 1] * 0.7152 + data.data[offset + 2] * 0.0722;
    const value = clamp(Math.round(((raw - low) / span) * 255), 0, 255);
    grayscale[offset] = grayscale[offset + 1] = grayscale[offset + 2] = value; grayscale[offset + 3] = 255;
  }
  return grayscale;
}

export async function prepareReceiptImage(file: File): Promise<PreparedReceiptImage> {
  const started = performance.now();
  const bitmap = await createImageBitmap(file);
  try {
    let scale = bitmap.width < 1200 ? Math.min(1.35, 1500 / Math.max(1, bitmap.width)) : 1;
    if (bitmap.width * scale > 2100) scale = 2100 / bitmap.width;
    if (bitmap.height * scale > 3600) scale = Math.min(scale, 3600 / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale)); const height = Math.max(1, Math.round(bitmap.height * scale));
    const base = document.createElement("canvas"); base.width = width; base.height = height;
    const baseContext = base.getContext("2d", { willReadFrequently: true }); if (!baseContext) throw new Error("Canvas no disponible");
    baseContext.fillStyle = "#fff"; baseContext.fillRect(0, 0, width, height); baseContext.drawImage(bitmap, 0, 0, width, height);
    const geometry = detectPaper(baseContext.getImageData(0, 0, width, height), width, height);
    const rectified = rectifyPaper(base, geometry); const straight = deskew(rectified.canvas);
    const natural = straight.canvas; const context = natural.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("Canvas no disponible");
    const data = context.getImageData(0, 0, natural.width, natural.height); const grayscaleBytes = contrastStretch(data);
    const grayscale = document.createElement("canvas"); grayscale.width = natural.width; grayscale.height = natural.height;
    grayscale.getContext("2d")?.putImageData(new ImageData(grayscaleBytes, natural.width, natural.height), 0, 0);
    const adaptiveBytes = localAdaptiveThreshold(grayscaleBytes, natural.width, natural.height);
    const adaptive = document.createElement("canvas"); adaptive.width = natural.width; adaptive.height = natural.height;
    adaptive.getContext("2d")?.putImageData(new ImageData(adaptiveBytes, natural.width, natural.height), 0, 0);
    return {
      adaptive,
      grayscale,
      deskewAngle: straight.angle,
      perspectiveCorrected: rectified.corrected,
      paperDetected: Boolean(geometry),
      durationMs: Math.round((performance.now() - started) * 10) / 10,
    };
  } finally {
    bitmap.close();
  }
}
