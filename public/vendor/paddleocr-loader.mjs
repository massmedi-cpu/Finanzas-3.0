const PADDLE_MODULE_URL = "https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm";
const LOCAL_TESSERACT_SCRIPT = "/vendor/document-engine/tesseract/tesseract.min.js";
const LOCAL_TESSERACT_WORKER = "/vendor/document-engine/tesseract/worker.min.js";
const LOCAL_TESSERACT_LANG = "/vendor/document-engine/tessdata";
const LOCAL_TESSERACT_CORE = "/vendor/document-engine/tesseract-core";

let paddleModulePromise;
let tesseractWorkerPromise;

function loadClassicScript(src, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (window.Tesseract) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(script);
  });
}

async function getPaddleModule() {
  if (!paddleModulePromise) paddleModulePromise = import(PADDLE_MODULE_URL);
  return paddleModulePromise;
}

async function getTesseractWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      if (!window.Tesseract) await loadClassicScript(LOCAL_TESSERACT_SCRIPT, "financial-tesseract-loader");
      if (!window.Tesseract?.createWorker) throw new Error("Tesseract local no disponible");
      return window.Tesseract.createWorker("spa", 1, {
        workerPath: LOCAL_TESSERACT_WORKER,
        langPath: LOCAL_TESSERACT_LANG,
        corePath: LOCAL_TESSERACT_CORE,
        cacheMethod: "none",
      });
    })().catch((error) => {
      tesseractWorkerPromise = undefined;
      throw error;
    });
  }
  return tesseractWorkerPromise;
}

async function imageSize(input) {
  if (typeof HTMLCanvasElement !== "undefined" && input instanceof HTMLCanvasElement) {
    return { width: input.width, height: input.height };
  }
  if (typeof createImageBitmap === "function" && input instanceof Blob) {
    const bitmap = await createImageBitmap(input);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  return { width: 1, height: 1 };
}

function wordsFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((block) =>
    (block?.paragraphs || []).flatMap((paragraph) =>
      (paragraph?.lines || []).flatMap((line) => line?.words || [])
    )
  );
}

function itemFromWord(word) {
  const text = String(word?.text || "").trim();
  const box = word?.bbox;
  if (!text || !box) return null;
  const x0 = Number(box.x0);
  const y0 = Number(box.y0);
  const x1 = Number(box.x1);
  const y1 = Number(box.y1);
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return null;
  const confidence = Number(word?.confidence);
  return {
    text,
    score: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 50,
    poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
  };
}

async function tesseractPredict(input) {
  const started = performance.now();
  const worker = await getTesseractWorker();
  const result = await worker.recognize(input, { rotateAuto: true }, { text: true, blocks: true });
  const size = await imageSize(input);
  const items = wordsFromBlocks(result?.data?.blocks).map(itemFromWord).filter(Boolean);
  const totalMs = Math.round(performance.now() - started);
  return [{
    image: size,
    items,
    metrics: {
      detMs: 0,
      recMs: totalMs,
      totalMs,
      detectedBoxes: items.length,
      recognizedCount: items.length,
    },
    runtime: "tesseract-local-fallback",
  }];
}

const PaddleOCR = {
  async create(options) {
    let primary = null;
    let primaryError = null;
    try {
      const module = await getPaddleModule();
      primary = await module.PaddleOCR.create(options);
    } catch (error) {
      primaryError = error;
    }

    let fallbackActive = !primary;
    return {
      async predict(input, params) {
        if (!fallbackActive && primary) {
          try {
            return await primary.predict(input, params);
          } catch (error) {
            primaryError = error;
            fallbackActive = true;
          }
        }
        try {
          return await tesseractPredict(input);
        } catch (fallbackError) {
          const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError || "PP-OCRv6 no disponible");
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError || "Tesseract no disponible");
          throw new Error(`PP-OCRv6: ${primaryMessage}. OCR local: ${fallbackMessage}`);
        }
      },
    };
  },
};

window.__financialPaddleOCR = { PaddleOCR };
window.dispatchEvent(new Event("financial-paddleocr-ready"));
