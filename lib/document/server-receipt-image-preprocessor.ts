import { detectPaper, estimateDeskewFromSamples } from "./receipt-image-preprocessor";

const DETECTION_MAX_WIDTH = 2100;
const DETECTION_MAX_HEIGHT = 3600;
const DETECTION_MAX_PIXELS = 3_200_000;
const OCR_MAX_SIDE = 3400;
const OCR_MAX_PIXELS = 4_800_000;
const OCR_MIN_SHORT_SIDE = 1000;
const OCR_MAX_UPSCALE = 2;
const MIN_COMPRESSED_SIDE = 1200;
const JPEG_QUALITIES = [0.94, 0.88, 0.82, 0.76] as const;
const EXIF_SCAN_BYTES = 128 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 12 * 1024 * 1024;

type CanvasModule = typeof import("@napi-rs/canvas/node-canvas");
type ServerCanvas = ReturnType<CanvasModule["createCanvas"]>;
type ServerImage = Awaited<ReturnType<CanvasModule["loadImage"]>>;
type PaperGeometry = NonNullable<ReturnType<typeof detectPaper>>;

export type ServerPreparedReceiptImage = {
  bytes: Buffer;
  mimeType: string;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  paperDetected: boolean;
  perspectiveCorrected: boolean;
  deskewAngle: number;
  scaled: boolean;
  orientationFlattened: boolean;
  preprocessed: boolean;
  durationMs: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const luminanceAt = (data: Uint8ClampedArray, offset: number) => (
  data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722
);

function scaledDimensions(width: number, height: number, scale: number) {
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.001) return { width, height };
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

function pixelScale(width: number, height: number, maxPixels: number) {
  const pixels = width * height;
  if (!pixels || pixels <= maxPixels) return 1;
  return Math.sqrt(maxPixels / pixels);
}

function detectionSize(width: number, height: number) {
  let scale = width < 1200 ? Math.min(1.35, 1500 / Math.max(1, width)) : 1;
  scale = Math.min(
    scale,
    DETECTION_MAX_WIDTH / Math.max(1, width),
    DETECTION_MAX_HEIGHT / Math.max(1, height),
    pixelScale(width, height, DETECTION_MAX_PIXELS),
  );
  return scaledDimensions(width, height, scale);
}

export function serverReceiptOcrSize(width: number, height: number) {
  const largest = Math.max(width, height);
  const shortest = Math.min(width, height);
  if (!largest || !shortest) return { width, height };
  const maxAllowedScale = Math.min(
    OCR_MAX_SIDE / largest,
    pixelScale(width, height, OCR_MAX_PIXELS),
  );
  let scale = Math.min(1, maxAllowedScale);
  if (scale >= 0.999 && shortest < OCR_MIN_SHORT_SIDE) {
    scale = Math.min(
      OCR_MAX_UPSCALE,
      OCR_MIN_SHORT_SIDE / shortest,
      maxAllowedScale,
    );
  }
  return scaledDimensions(width, height, scale);
}

function readUint16(view: DataView, offset: number, littleEndian: boolean) {
  if (offset < 0 || offset + 2 > view.byteLength) return null;
  return view.getUint16(offset, littleEndian);
}

function readUint32(view: DataView, offset: number, littleEndian: boolean) {
  if (offset < 0 || offset + 4 > view.byteLength) return null;
  return view.getUint32(offset, littleEndian);
}

/** Lee exclusivamente EXIF Orientation; no interpreta ni conserva otros metadatos. */
export function serverJpegExifOrientation(bytes: Buffer, mimeType: string) {
  if (mimeType.toLowerCase() !== "image/jpeg" || bytes.byteLength < 4) return null;
  const length = Math.min(bytes.byteLength, EXIF_SCAN_BYTES);
  const view = new DataView(bytes.buffer, bytes.byteOffset, length);
  if (view.getUint16(0, false) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) { offset += 1; continue; }
    const marker = view.getUint8(offset + 1);
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xff) { offset += 1; continue; }
    const segmentLength = view.getUint16(offset + 2, false);
    if (segmentLength < 2 || offset + 2 + segmentLength > view.byteLength) break;
    const payload = offset + 4;
    if (marker === 0xe1 && segmentLength >= 10
      && view.getUint8(payload) === 0x45
      && view.getUint8(payload + 1) === 0x78
      && view.getUint8(payload + 2) === 0x69
      && view.getUint8(payload + 3) === 0x66
      && view.getUint8(payload + 4) === 0x00
      && view.getUint8(payload + 5) === 0x00) {
      const tiff = payload + 6;
      if (tiff + 8 > view.byteLength) return null;
      const byteOrder = view.getUint16(tiff, false);
      const littleEndian = byteOrder === 0x4949;
      if (!littleEndian && byteOrder !== 0x4d4d) return null;
      if (readUint16(view, tiff + 2, littleEndian) !== 0x2a) return null;
      const ifdOffset = readUint32(view, tiff + 4, littleEndian);
      if (ifdOffset == null) return null;
      const ifd = tiff + ifdOffset;
      const entries = readUint16(view, ifd, littleEndian);
      if (entries == null) return null;
      for (let index = 0; index < entries; index += 1) {
        const entry = ifd + 2 + index * 12;
        if (entry + 12 > view.byteLength) return null;
        if (readUint16(view, entry, littleEndian) !== 0x0112) continue;
        const orientation = readUint16(view, entry + 8, littleEndian);
        return orientation != null && orientation >= 1 && orientation <= 8 ? orientation : null;
      }
      return null;
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function drawSource(createCanvas: CanvasModule["createCanvas"], source: ServerImage | ServerCanvas, width: number, height: number) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

function rectifyPaper(createCanvas: CanvasModule["createCanvas"], source: ServerCanvas, geometry: PaperGeometry) {
  const sourceHeight = Math.max(1, geometry.bottom - geometry.top);
  const topWidth = geometry.topRight - geometry.topLeft;
  const bottomWidth = geometry.bottomRight - geometry.bottomLeft;
  const targetWidth = Math.max(1, Math.round((topWidth + bottomWidth) / 2));
  const marginX = Math.round(targetWidth * 0.04);
  const marginY = Math.round(sourceHeight * 0.025);
  const output = createCanvas(targetWidth + marginX * 2, sourceHeight + marginY * 2);
  const context = output.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, output.width, output.height);
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

function darkSamples(createCanvas: CanvasModule["createCanvas"], source: ServerCanvas) {
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const sampleCanvas = drawSource(createCanvas, source, width, height);
  const sample = sampleCanvas.getContext("2d").getImageData(0, 0, width, height);
  const points: Array<{ x: number; y: number }> = [];
  const stride = Math.max(1, Math.round(Math.max(width, height) / 700));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      if (luminanceAt(sample.data, offset) < 150) points.push({ x, y });
    }
  }
  if (points.length > 18000) {
    const every = Math.ceil(points.length / 18000);
    return { points: points.filter((_, index) => index % every === 0), width, height };
  }
  return { points, width, height };
}

function deskew(createCanvas: CanvasModule["createCanvas"], source: ServerCanvas) {
  const sample = darkSamples(createCanvas, source);
  const angle = estimateDeskewFromSamples(sample.points, sample.width, sample.height);
  if (!angle) return { canvas: source, angle: 0 };
  const radians = (-angle * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const output = createCanvas(
    Math.ceil(source.width * cosine + source.height * sine),
    Math.ceil(source.height * cosine + source.width * sine),
  );
  const context = output.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, output.width, output.height);
  context.translate(output.width / 2, output.height / 2);
  context.rotate(radians);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return { canvas: output, angle };
}

function percentile(values: number[], ratio: number, fallback: number) {
  if (!values.length) return fallback;
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(values.length * ratio)))] ?? fallback;
}

/**
 * Compensa gradientes longitudinales de iluminación sin binarizar el ticket.
 * El fondo del papel se estima por fila usando percentiles claros y se suaviza;
 * después se aplica una corrección limitada y un contraste global sobre la
 * luminancia ya normalizada. Mantiene una sola imagen y una sola inferencia OCR.
 */
export function normalizeReceiptLuminanceRows(data: Uint8ClampedArray, width: number, height: number) {
  if (width < 1 || height < 1 || data.length < width * height * 4) return data;
  const rowBackground = new Float64Array(height);
  const xStep = Math.max(1, Math.floor(width / 128));
  for (let y = 0; y < height; y += 1) {
    const samples: number[] = [];
    for (let x = 0; x < width; x += xStep) {
      samples.push(luminanceAt(data, (y * width + x) * 4));
    }
    rowBackground[y] = percentile(samples, 0.84, 230);
  }

  const radius = clamp(Math.round(height / 80), 3, 48);
  const prefix = new Float64Array(height + 1);
  for (let y = 0; y < height; y += 1) prefix[y + 1] = prefix[y] + rowBackground[y];
  const smooth = new Float64Array(height);
  for (let y = 0; y < height; y += 1) {
    const start = Math.max(0, y - radius);
    const end = Math.min(height, y + radius + 1);
    smooth[y] = (prefix[end] - prefix[start]) / Math.max(1, end - start);
  }

  const backgrounds = Array.from(smooth);
  const targetBackground = clamp(percentile([...backgrounds], 0.75, 230), 185, 245);
  const lowBackground = percentile([...backgrounds], 0.10, targetBackground);
  const highBackground = percentile([...backgrounds], 0.90, targetBackground);
  const compensate = highBackground - lowBackground >= 12;
  const correction = new Float64Array(height);
  for (let y = 0; y < height; y += 1) {
    correction[y] = compensate ? clamp(targetBackground - smooth[y], -45, 95) : 0;
  }

  const correctedSamples: number[] = [];
  const pixelCount = width * height;
  const every = Math.max(1, Math.floor(pixelCount / 30000));
  for (let pixel = 0; pixel < pixelCount; pixel += every) {
    const offset = pixel * 4;
    const raw = luminanceAt(data, offset);
    const y = Math.floor(pixel / width);
    const weight = 0.45 + 0.55 * (raw / 255);
    correctedSamples.push(clamp(raw + correction[y] * weight, 0, 255));
  }
  const low = percentile(correctedSamples, 0.03, 0);
  const high = percentile(correctedSamples, 0.97, 255);
  const span = Math.max(48, high - low);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const raw = luminanceAt(data, offset);
    const y = Math.floor(pixel / width);
    const weight = 0.45 + 0.55 * (raw / 255);
    const corrected = clamp(raw + correction[y] * weight, 0, 255);
    const value = clamp(Math.round(((corrected - low) / span) * 255), 0, 255);
    data[offset] = data[offset + 1] = data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return data;
}

function normalizeReceiptContrast(source: ServerCanvas) {
  const context = source.getContext("2d");
  const image = context.getImageData(0, 0, source.width, source.height);
  normalizeReceiptLuminanceRows(image.data, source.width, source.height);
  context.putImageData(image, 0, 0);
  return source;
}

function resizeCanvas(createCanvas: CanvasModule["createCanvas"], source: ServerCanvas, width: number, height: number) {
  if (source.width === width && source.height === height) return source;
  return drawSource(createCanvas, source, width, height);
}

function encodeJpeg(canvas: ServerCanvas, quality: number) {
  return Buffer.from(canvas.toBuffer("image/jpeg", { quality }));
}

function encodeWithinLimit(createCanvas: CanvasModule["createCanvas"], initial: ServerCanvas, maxBytes: number) {
  let canvas = initial;
  let best = Buffer.alloc(0);
  while (true) {
    for (const quality of JPEG_QUALITIES) {
      const encoded = encodeJpeg(canvas, quality);
      best = encoded;
      if (encoded.byteLength <= maxBytes) return { bytes: encoded, canvas };
    }
    const largest = Math.max(canvas.width, canvas.height);
    if (largest <= MIN_COMPRESSED_SIDE) break;
    const nextMax = Math.max(MIN_COMPRESSED_SIDE, Math.round(largest * 0.82));
    const scale = nextMax / largest;
    canvas = resizeCanvas(
      createCanvas,
      canvas,
      Math.max(1, Math.round(canvas.width * scale)),
      Math.max(1, Math.round(canvas.height * scale)),
    );
  }
  if (best.byteLength && best.byteLength <= maxBytes) return { bytes: best, canvas };
  throw new Error("server_receipt_preprocess_too_large");
}

function detectServerPaper(canvas: ServerCanvas) {
  const context = canvas.getContext("2d");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return detectPaper(image as unknown as ImageData, canvas.width, canvas.height);
}

/**
 * Equivalente server-side del preprocesado seguro usado por cámara/galería.
 * Se usa en sincronización Drive antes de la MISMA y única inferencia Tesseract.
 * Si no puede decodificar o no detecta papel, el llamador puede conservar el
 * original; no hay una segunda lectura ni recortes basados en vocabulario.
 */
export async function prepareServerReceiptImageBytes(
  bytes: Buffer,
  mimeType = "image/jpeg",
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
): Promise<ServerPreparedReceiptImage> {
  const started = Date.now();
  const canvasModule = await import("@napi-rs/canvas/node-canvas");
  const image = await canvasModule.loadImage(bytes);
  const sourceWidth = Math.max(1, Number(image.width) || 1);
  const sourceHeight = Math.max(1, Number(image.height) || 1);
  const orientation = serverJpegExifOrientation(bytes, mimeType);
  const orientationFlattened = orientation != null && orientation !== 1;

  const detectSize = detectionSize(sourceWidth, sourceHeight);
  const detectionCanvas = drawSource(canvasModule.createCanvas, image, detectSize.width, detectSize.height);
  const geometry = detectServerPaper(detectionCanvas);

  let working: ServerCanvas;
  let perspectiveCorrected = false;
  let deskewAngle = 0;
  let paperDetected = false;

  if (geometry) {
    const rectified = rectifyPaper(canvasModule.createCanvas, detectionCanvas, geometry);
    const straight = deskew(canvasModule.createCanvas, rectified.canvas);
    working = normalizeReceiptContrast(straight.canvas);
    perspectiveCorrected = rectified.corrected;
    deskewAngle = straight.angle;
    paperDetected = true;
  } else {
    const target = serverReceiptOcrSize(sourceWidth, sourceHeight);
    const needsScale = target.width !== sourceWidth || target.height !== sourceHeight;
    if (!needsScale && !orientationFlattened) {
      return {
        bytes,
        mimeType,
        sourceWidth,
        sourceHeight,
        outputWidth: sourceWidth,
        outputHeight: sourceHeight,
        paperDetected: false,
        perspectiveCorrected: false,
        deskewAngle: 0,
        scaled: false,
        orientationFlattened: false,
        preprocessed: false,
        durationMs: Date.now() - started,
      };
    }
    working = drawSource(canvasModule.createCanvas, image, target.width, target.height);
  }

  const target = serverReceiptOcrSize(working.width, working.height);
  const finalCanvas = resizeCanvas(canvasModule.createCanvas, working, target.width, target.height);
  const encoded = encodeWithinLimit(canvasModule.createCanvas, finalCanvas, Math.max(1, maxOutputBytes));
  const scaled = encoded.canvas.width !== sourceWidth || encoded.canvas.height !== sourceHeight;

  return {
    bytes: encoded.bytes,
    mimeType: "image/jpeg",
    sourceWidth,
    sourceHeight,
    outputWidth: encoded.canvas.width,
    outputHeight: encoded.canvas.height,
    paperDetected,
    perspectiveCorrected,
    deskewAngle,
    scaled,
    orientationFlattened,
    preprocessed: true,
    durationMs: Date.now() - started,
  };
}