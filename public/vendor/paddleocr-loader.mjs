const SERVER_OCR_ENDPOINT = "/api/ocr/receipt";
const SERVER_TIMEOUT_MS = 55_000;
const MAX_SIDE = 2600;
const DIRECT_BLOB_LIMIT = 3.5 * 1024 * 1024;
const MAX_SERVER_BYTES = 4.5 * 1024 * 1024;
const MIN_COMPRESSED_SIDE = 1200;
const JPEG_QUALITIES = [0.94, 0.88, 0.82, 0.76];
const DIRECT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
    const target = scaledSize(input.width, input.height);
    const canvas = target.width === input.width && target.height === input.height
      ? input
      : drawToCanvas(input, target.width, target.height);
    return { blob: await constrainedCanvasBlob(canvas), width: canvas.width, height: canvas.height };
  }

  if (!(input instanceof Blob)) throw new Error("Formato OCR no compatible");
  const type = String(input.type || "").toLowerCase();
  if (DIRECT_IMAGE_TYPES.has(type) && input.size <= DIRECT_BLOB_LIMIT) {
    return { blob: input, width: 0, height: 0 };
  }

  const bitmap = await decodeBlob(input);
  try {
    const target = scaledSize(bitmap.width, bitmap.height);
    const canvas = drawToCanvas(bitmap, target.width, target.height);
    return { blob: await constrainedCanvasBlob(canvas), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close?.();
  }
}

async function serverPredict(input) {
  const prepared = await prepareServerInput(input);
  if (prepared.blob.size > MAX_SERVER_BYTES) {
    throw new Error("La copia preparada para OCR supera el límite seguro del servidor");
  }
  const timeout = withAbortTimeout(SERVER_TIMEOUT_MS);
  try {
    const response = await fetch(SERVER_OCR_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": prepared.blob.type || "image/jpeg",
        ...(prepared.width > 0 ? { "x-ocr-width": String(prepared.width) } : {}),
        ...(prepared.height > 0 ? { "x-ocr-height": String(prepared.height) } : {}),
      },
      body: prepared.blob,
      cache: "no-store",
      signal: timeout.controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || !body?.result) {
      throw new Error(body?.error || `OCR server ${response.status}`);
    }
    return [body.result];
  } finally {
    timeout.clear();
  }
}

const PaddleOCR = {
  async create() {
    return {
      predict: serverPredict,
    };
  },
};

window.__financialPaddleOCR = { PaddleOCR };
window.dispatchEvent(new Event("financial-paddleocr-ready"));
