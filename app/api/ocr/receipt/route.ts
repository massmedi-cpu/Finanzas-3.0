import { NextRequest } from "next/server";
import { createWorker } from "tesseract.js";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_OCR_BYTES = 5 * 1024 * 1024;
const OCR_TIMEOUT_MS = 50_000;

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;
type PaddleItem = { text: string; score: number; poly: number[][] };
type UnknownRecord = Record<string, unknown>;

let workerPromise: Promise<TesseractWorker> | null = null;
let workerOrigin = "";
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
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function getWorker(origin: string) {
  if (!workerPromise || workerOrigin !== origin) {
    workerOrigin = origin;
    workerPromise = createWorker("spa", 1, {
      langPath: `${origin}/vendor/document-engine/tessdata`,
      cacheMethod: "none",
    }).catch((error) => {
      workerPromise = null;
      workerOrigin = "";
      throw error;
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

async function recognizeExclusive(bytes: Buffer, origin: string) {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const worker = await withTimeout(getWorker(origin), OCR_TIMEOUT_MS, "ocr_worker");
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

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return apiError("ocr_image_required", 415);

  const arrayBuffer = await request.arrayBuffer();
  if (!arrayBuffer.byteLength || arrayBuffer.byteLength > MAX_OCR_BYTES) return apiError("ocr_image_too_large", 413);

  const width = Math.max(1, Number(request.headers.get("x-ocr-width")) || 1);
  const height = Math.max(1, Number(request.headers.get("x-ocr-height")) || 1);
  const started = Date.now();

  try {
    const recognition = await recognizeExclusive(Buffer.from(arrayBuffer), request.nextUrl.origin);
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
  } catch (error) {
    console.error("financial_app_server_receipt_ocr_failed", {
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    workerPromise = null;
    workerOrigin = "";
    return apiError("ocr_server_failed", 503);
  }
}
