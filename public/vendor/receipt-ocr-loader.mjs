const SERVER_OCR_ENDPOINT = "/api/ocr/receipt";
const SERVER_TIMEOUT_MS = 55_000;
// Dense invoices/albaranes need more character density than thermal receipts.
// 3400px still cuts a 4080x3072 phone photo from 12.5MP to ~8.7MP while
// preserving substantially more small text than the previous 2600px ceiling.
const MAX_SIDE = 3400;
const DIRECT_BLOB_LIMIT = 3.5 * 1024 * 1024;
const MAX_SERVER_BYTES = 4.5 * 1024 * 1024;
const MIN_COMPRESSED_SIDE = 1200;
const JPEG_QUALITIES = [0.94, 0.88, 0.82, 0.76];
const DIRECT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const nowMs = () => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
const roundedMs = (value) => Math.max(0, Math.round(value * 10) / 10);

function withAbortTimeout(timeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(new Error("OCR server timeout")), timeoutMs);
  return { controller, clear: () => window.clearTimeout(timer) };
}

async function canvasToBlob(canvas, quality = 0.94) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo preparar la imagen OCR")), "image/jpeg", quality);
  });
}

function scaledSize(width, height, maxSide = MAX_SIDE) {
  const largest = Math.max(width, height);
  if (!largest || largest <= maxSide) return { width, height };
  const scale = maxSide / largest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function drawToCanvas(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas OCR no disponible");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function constrainedCanvasBlob(sourceCanvas) {
  let canvas = sourceCanvas;
  let best = null;
  while (true) {
    for (const quality of JPEG_QUALITIES) {
      const blob = await canvasToBlob(canvas, quality);
      best = blob;
      if (blob.size <= MAX_SERVER_BYTES) return blob;
    }
    const largest = Math.max(canvas.width, canvas.height);
    if (largest <= MIN_COMPRESSED_SIDE) break;
    const nextMax = Math.max(MIN_COMPRESSED_SIDE, Math.round(largest * 0.82));
    const target = scaledSize(canvas.width, canvas.height, nextMax);
    canvas = drawToCanvas(canvas, target.width, target.height);
  }
  if (best && best.size <= MAX_SERVER_BYTES) return best;
  throw new Error("La imagen sigue siendo demasiado grande para el OCR después de optimizarla");
}

async function decodeBlob(blob) {
  if (typeof createImageBitmap !== "function") {
    throw new Error("Este navegador no puede convertir este formato de imagen para OCR");
  }
  try {
    return await createImageBitmap(blob);
  } catch {
    const type = String(blob.type || "").toLowerCase();
    if (type === "image/heic" || type === "image/heif") {
      throw new Error("Este dispositivo no puede decodificar HEIC/HEIF. El original se conservará para revisión manual");
    }
    throw new Error("No se ha podido decodificar la imagen para OCR");
  }
}

async function prepareServerInput(input) {
  if (typeof HTMLCanvasElement !== "undefined" && input instanceof HTMLCanvasElement) {
    const sourceWidth = input.width;
    const sourceHeight = input.height;
    const target = scaledSize(sourceWidth, sourceHeight);
    const canvas = target.width === sourceWidth && target.height === sourceHeight
      ? input
      : drawToCanvas(input, target.width, target.height);
    return {
      blob: await constrainedCanvasBlob(canvas),
      width: canvas.width,
      height: canvas.height,
      sourceWidth,
      sourceHeight,
      scaled: canvas.width !== sourceWidth || canvas.height !== sourceHeight,
    };
  }

  if (!(input instanceof Blob)) throw new Error("Formato OCR no compatible");
  const type = String(input.type || "").toLowerCase();
  const directCandidate = DIRECT_IMAGE_TYPES.has(type) && input.size <= DIRECT_BLOB_LIMIT;

  // Preserve compatibility on browsers that cannot inspect image dimensions.
  // Modern browsers decide by dimensions, not only compressed bytes.
  if (directCandidate && typeof createImageBitmap !== "function") {
    return { blob: input, width: 0, height: 0, sourceWidth: 0, sourceHeight: 0, scaled: false };
  }

  const bitmap = await decodeBlob(input);
  try {
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const target = scaledSize(sourceWidth, sourceHeight);
    const scaled = target.width !== sourceWidth || target.height !== sourceHeight;

    if (directCandidate && !scaled) {
      return { blob: input, width: sourceWidth, height: sourceHeight, sourceWidth, sourceHeight, scaled: false };
    }

    const canvas = drawToCanvas(bitmap, target.width, target.height);
    return {
      blob: await constrainedCanvasBlob(canvas),
      width: canvas.width,
      height: canvas.height,
      sourceWidth,
      sourceHeight,
      scaled,
    };
  } finally {
    bitmap.close?.();
  }
}

async function serverPredict(input) {
  const predictStarted = nowMs();
  const prepareStarted = predictStarted;
  const prepared = await prepareServerInput(input);
  const prepareMs = roundedMs(nowMs() - prepareStarted);
  if (prepared.blob.size > MAX_SERVER_BYTES) {
    throw new Error("La copia preparada para OCR supera el límite seguro del servidor");
  }
  const timeout = withAbortTimeout(SERVER_TIMEOUT_MS);
  try {
    const requestStarted = nowMs();
    const response = await fetch(SERVER_OCR_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": prepared.blob.type || "image/jpeg",
        ...(prepared.width > 0 ? { "x-ocr-width": String(prepared.width) } : {}),
        ...(prepared.height > 0 ? { "x-ocr-height": String(prepared.height) } : {}),
        ...(prepared.sourceWidth > 0 ? { "x-ocr-source-width": String(prepared.sourceWidth) } : {}),
        ...(prepared.sourceHeight > 0 ? { "x-ocr-source-height": String(prepared.sourceHeight) } : {}),
        "x-ocr-scaled": prepared.scaled ? "1" : "0",
      },
      body: prepared.blob,
      cache: "no-store",
      signal: timeout.controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || !body?.result) {
      throw new Error(body?.error || `OCR server ${response.status}`);
    }

    const totalMs = roundedMs(nowMs() - predictStarted);
    const transportMs = roundedMs(nowMs() - requestStarted);
    const serverMetrics = body.result.metrics && typeof body.result.metrics === "object" ? body.result.metrics : {};
    const serverMs = Number(serverMetrics.totalMs);
    return [{
      ...body.result,
      metrics: {
        ...serverMetrics,
        serverMs: Number.isFinite(serverMs) ? serverMs : null,
        prepareMs,
        transportMs,
        totalMs,
        sourceWidth: prepared.sourceWidth || null,
        sourceHeight: prepared.sourceHeight || null,
        transportWidth: prepared.width || null,
        transportHeight: prepared.height || null,
        transportScaled: prepared.scaled,
      },
    }];
  } finally {
    timeout.clear();
  }
}

const ReceiptOCR = {
  async create() {
    return { predict: serverPredict };
  },
};

window.__financialReceiptOCR = { ReceiptOCR };
window.dispatchEvent(new Event("financial-receipt-ocr-ready"));
