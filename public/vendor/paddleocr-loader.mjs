const LEGACY_PADDLE_BASELINE = "@paddleocr/paddleocr-js@0.4.2";
void LEGACY_PADDLE_BASELINE;

const SERVER_OCR_ENDPOINT = "/api/ocr/receipt";
const SERVER_TIMEOUT_MS = 55_000;
const MAX_SIDE = 2600;
const DIRECT_BLOB_LIMIT = 3.5 * 1024 * 1024;

function withAbortTimeout(timeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(new Error("OCR server timeout")), timeoutMs);
  return { controller, clear: () => window.clearTimeout(timer) };
}

async function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo preparar la imagen OCR")), "image/jpeg", 0.94);
  });
}

function scaledSize(width, height) {
  const largest = Math.max(width, height);
  if (!largest || largest <= MAX_SIDE) return { width, height };
  const scale = MAX_SIDE / largest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function blobSize(blob) {
  if (typeof createImageBitmap !== "function") return { width: 1, height: 1, bitmap: null };
  const bitmap = await createImageBitmap(blob);
  return { width: bitmap.width, height: bitmap.height, bitmap };
}

async function prepareServerInput(input) {
  if (typeof HTMLCanvasElement !== "undefined" && input instanceof HTMLCanvasElement) {
    const target = scaledSize(input.width, input.height);
    if (target.width === input.width && target.height === input.height) {
      return { blob: await canvasToBlob(input), width: input.width, height: input.height };
    }
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas OCR no disponible");
    context.drawImage(input, 0, 0, target.width, target.height);
    return { blob: await canvasToBlob(canvas), width: target.width, height: target.height };
  }

  if (!(input instanceof Blob)) throw new Error("Formato OCR no compatible");
  const size = await blobSize(input);
  try {
    if (input.size <= DIRECT_BLOB_LIMIT && Math.max(size.width, size.height) <= MAX_SIDE) {
      return { blob: input, width: size.width, height: size.height };
    }
    if (!size.bitmap) return { blob: input, width: size.width, height: size.height };
    const target = scaledSize(size.width, size.height);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas OCR no disponible");
    context.drawImage(size.bitmap, 0, 0, target.width, target.height);
    return { blob: await canvasToBlob(canvas), width: target.width, height: target.height };
  } finally {
    size.bitmap?.close?.();
  }
}

async function serverPredict(input) {
  const prepared = await prepareServerInput(input);
  const timeout = withAbortTimeout(SERVER_TIMEOUT_MS);
  try {
    const response = await fetch(SERVER_OCR_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": prepared.blob.type || "image/jpeg",
        "x-ocr-width": String(prepared.width),
        "x-ocr-height": String(prepared.height),
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
