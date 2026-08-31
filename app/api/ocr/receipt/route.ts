import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { createWorker } from "tesseract.js";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api/response";
import { readServerImageMetadata } from "@/lib/document/server-image-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_OCR_BYTES = 5 * 1024 * 1024;
const MAX_OCR_SIDE = 12_000;
const MAX_OCR_PIXELS = 80_000_000;
const OCR_TIMEOUT_MS = 50_000;
const OCR_QUEUE_TIMEOUT_MS = 10_000;
const OCR_RUNTIME_FILES = [
  path.join(process.cwd(), "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js"),
  path.join(process.cwd(), "node_modules", "tesseract.js-core", "package.json"),
  path.join(process.cwd(), "node_modules", "regenerator-runtime", "runtime.js"),
  path.join(process.cwd(), "public", "vendor", "document-engine", "tessdata", "spa.traineddata.gz"),
] as const;

for (const runtimeFile of OCR_RUNTIME_FILES) {
  if (!fs.existsSync(/* turbopackIgnore: true */ runtimeFile)) {
    throw new Error(`ocr_runtime_asset_missing:${path.relative(process.cwd(), runtimeFile)}`);
  }
}

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;
type PaddleItem = { text: string; score: number; poly: number[][] };
type UnknownRecord = Record<string, unknown>;

let workerPromise: Promise<TesseractWorker> | null = null;
let workerRoot = "";
let queue: Promise<void> = Promise.resolve();

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (failure) => { clearTimeout(timer); reject(failure); },
    );
  });
}

async function resetWorker() {
  const current = workerPromise;
  workerPromise = null;
  workerRoot = "";
  if (!current) return;
  try {
    const worker = await current;
    await worker.terminate();
  } catch {
    // A failed worker is already unusable; keep reset best-effort.
  }
}

async function getWorker() {
  const root = process.cwd();
  if (!workerPromise || workerRoot !== root) {
    workerRoot = root;
    workerPromise = createWorker("spa", 1, {
      workerPath: path.join(root, "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js"),
      corePath: path.join(root, "node_modules", "tesseract.js-core"),
      langPath: path.join(root, "public", "vendor", "document-engine", "tessdata"),
      cacheMethod: "none",
    }).catch((failure) => {
      workerPromise = null;
      workerRoot = "";
      throw failure;
    });
  }
  return workerPromise;
}

function itemFromWord(value: unknown): PaddleItem | null {
  const word = asRecord(value);
  if (!word) return null;
  const text = String(word.text || "").trim();
  const box = asRecord(word.bbox);
  const x0 = Number(box?.x0);
  const y0 = Number(box?.y0);
  const x1 = Number(box?.x1);
  const y1 = Number(box?.y1);
  if (!text || ![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return null;
  const confidence = Number(word.confidence);
  return {
    text,
    score: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 50,
    poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
  };
}

function wordsFromBlocks(blocks: unknown): PaddleItem[] {
  const items: PaddleItem[] = [];
  for (const blockValue of asArray(blocks)) {
    const block = asRecord(blockValue);
    for (const paragraphValue of asArray(block?.paragraphs)) {
      const paragraph = asRecord(paragraphValue);
      for (const lineValue of asArray(paragraph?.lines)) {
        const line = asRecord(lineValue);
        for (const wordValue of asArray(line?.words)) {
          const item = itemFromWord(wordValue);
          if (item) items.push(item);
        }
      }
    }
  }
  return items;
}

function wordsFromTsv(tsv: unknown): PaddleItem[] {
  if (typeof tsv !== "string") return [];
  const lines = tsv.split(/\r?\n/).slice(1);
  const items: PaddleItem[] = [];
  for (const line of lines) {
    const columns = line.split("\t");
    if (columns.length < 12 || columns[0] !== "5") continue;
    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    const confidence = Number(columns[10]);
    const text = columns.slice(11).join("\t").trim();
    if (!text || ![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
    items.push({
      text,
      score: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 50,
      poly: [[left, top], [left + width, top], [left + width, top + height], [left, top + height]],
    });
  }
  return items;
}

async function recognizeExclusive(bytes: Buffer) {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => { release = resolve; });
  try {
    await withTimeout(previous, OCR_QUEUE_TIMEOUT_MS, "ocr_queue");
    const worker = await withTimeout(getWorker(), OCR_TIMEOUT_MS, "ocr_worker");
    return await withTimeout(
      worker.recognize(bytes, {}, { text: true, blocks: true, tsv: true }),
      OCR_TIMEOUT_MS,
      "ocr_recognize",
    );
  } finally {
    release();
  }
}

export async function POST(request: NextRequest) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();

  const declaredContentType = (request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (declaredContentType && !declaredContentType.startsWith("image/")) return apiError("ocr_image_required", 415);

  const arrayBuffer = await request.arrayBuffer();
  if (!arrayBuffer.byteLength || arrayBuffer.byteLength > MAX_OCR_BYTES) return apiError("ocr_image_too_large", 413);

  const bytes = Buffer.from(arrayBuffer);
  const image = readServerImageMetadata(bytes);
  if (!image) return apiError("ocr_image_format_unsupported", 415);
  if (image.width > MAX_OCR_SIDE || image.height > MAX_OCR_SIDE || image.width * image.height > MAX_OCR_PIXELS) {
    return apiError("ocr_image_dimensions_too_large", 413);
  }

  const width = image.width;
  const height = image.height;
  const started = Date.now();

  try {
    const recognition = await recognizeExclusive(bytes);
    const data = asRecord(recognition?.data) || {};
    let items = wordsFromBlocks(data.blocks);
    if (!items.length) items = wordsFromTsv(data.tsv);
    const rawText = typeof data.text === "string" ? data.text.trim() : "";
    if (!items.length && rawText) {
      const confidence = Number(data.confidence);
      items = [{
        text: rawText,
        score: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 50,
        poly: [[0, 0], [width, 0], [width, height], [0, height]],
      }];
    }
    if (!items.length) return apiError("ocr_no_text", 422);

    const totalMs = Date.now() - started;
    return apiJson({
      ok: true,
      result: {
        image: { width, height },
        items,
        metrics: {
          detMs: 0,
          recMs: totalMs,
          totalMs,
          detectedBoxes: items.length,
          recognizedCount: items.length,
        },
        runtime: "server-tesseract-7",
      },
    });
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : "";
    console.error("financial_app_server_receipt_ocr_failed", {
      type: failure instanceof Error ? failure.name : "unknown_failure",
      reason: message || "unknown_failure",
    });
    if (message === "ocr_queue_timeout") return apiError("ocr_server_busy", 503);
    await resetWorker();
    return apiError("ocr_server_failed", 503);
  }
}
