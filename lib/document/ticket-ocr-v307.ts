import {
  inferDocumentMetadata,
  normalizeOcrText,
  preserveOcrLayout,
  parseEuroValue,
  type DocumentTypeHint,
  type DocumentMetadata,
  type ImageOcrResult,
} from "./ticket-ocr";

export { inferDocumentMetadata, normalizeOcrText, preserveOcrLayout, parseEuroValue };
export type { DocumentTypeHint, DocumentMetadata, ImageOcrResult };

type Recognition = { data?: { text?: string; confidence?: number; tsv?: string } };
type Worker = {
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (
    input: File | HTMLCanvasElement,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<Recognition>;
};
type Word = { text: string; conf: number; left: number; top: number; width: number; key: string };
type PaperGeometry = {
  top: number;
  bottom: number;
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
};
type Candidate = {
  variant: string;
  text: string;
  layoutText: string;
  confidence: number | null;
  score: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const repair = (value: string) =>
  value
    .replace(/(\d)\s*[:;]\s*(\d{2})(?=\b)/g, "$1.$2")
    .replace(/(\bTOTAL\b[^\d]{0,12})(\d{1,4})\s+(\d{2})(?=\s*(?:€|EUR)\b)/gi, "$1$2,$3")
    .trimEnd();
const visibleChars = (value: string) => value.replace(/\s/g, "").length;

export function reconstructTsvReceipt(tsv: string) {
  if (!tsv.trim()) return null;
  const words: Word[] = [];
  for (const row of tsv.replace(/\r/g, "").split("\n").slice(1)) {
    const columns = row.split("\t");
    if (columns.length < 12 || Number(columns[0]) !== 5) continue;
    const text = columns.slice(11).join("\t").trim();
    const conf = Number(columns[10]);
    if (!text || !Number.isFinite(conf) || conf < 28) continue;
    const visible = text.replace(/\s/g, "");
    const useful = (visible.match(/[\p{L}\d€%.,:()/-]/gu) || []).length;
    if (visible.length && useful / visible.length < 0.55) continue;
    words.push({
      text,
      conf,
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      key: `${columns[2]}:${columns[3]}:${columns[4]}`,
    });
  }

  const groups = new Map<string, Word[]>();
  for (const word of words) {
    const group = groups.get(word.key) || [];
    group.push(word);
    groups.set(word.key, group);
  }

  const lines = [...groups.values()]
    .map((group) => {
      group.sort((a, b) => a.left - b.left);
      const mean = group.reduce((sum, word) => sum + word.conf, 0) / group.length;
      const plain = repair(group.map((word) => word.text).join(" "));
      const strong =
        /\b(total|iva|base|fecha|hora|mesa|precio|importe|pendiente)\b/i.test(plain) ||
        /\d+[.,:]\d{2}/.test(plain);
      if (mean < 38 && !strong) return null;
      const widths = group
        .map((word) => word.width / Math.max(1, word.text.length))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const charWidth = Math.max(5, widths[Math.floor(widths.length / 2)] || 9);
      const left = group[0].left;
      let layout = "";
      for (const word of group) {
        const column = Math.max(0, Math.round((word.left - left) / charWidth));
        if (layout.length < column) layout += " ".repeat(column - layout.length);
        else if (layout && !layout.endsWith(" ")) layout += " ";
        layout += word.text;
      }
      return { top: Math.min(...group.map((word) => word.top)), plain, layout: repair(layout) };
    })
    .filter((line): line is { top: number; plain: string; layout: string } => Boolean(line))
    .sort((a, b) => a.top - b.top);

  return lines.length
    ? { text: lines.map((line) => line.plain).join("\n"), layoutText: lines.map((line) => line.layout).join("\n") }
    : null;
}

export function estimateDeskewFromSamples(samples: Array<{ x: number; y: number }>, width: number, height: number) {
  if (samples.length < 80) return 0;
  let bestAngle = 0;
  let bestScore = -Infinity;
  const step = Math.max(2, Math.round(height / 420));
  for (let angle = -7; angle <= 7; angle += 0.5) {
    const radians = (angle * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
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
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return Math.abs(bestAngle) < 0.45 ? 0 : Math.round(bestAngle * 2) / 2;
}

function paperGeometry(data: ImageData, width: number, height: number): PaperGeometry | null {
  const step = Math.max(4, Math.floor(Math.max(width, height) / 650));
  const rows = Math.ceil(height / step);
  const columns = Math.ceil(width / step);
  const minHits = Math.max(4, Math.round(columns * 0.16));
  const spans: Array<{ y: number; left: number; right: number }> = [];
  for (let gridY = 0; gridY < rows; gridY += 1) {
    const y = Math.min(height - 1, gridY * step);
    let hits = 0;
    let left = width;
    let right = 0;
    for (let gridX = 0; gridX < columns; gridX += 1) {
      const x = Math.min(width - 1, gridX * step);
      const offset = (y * width + x) * 4;
      const red = data.data[offset];
      const green = data.data[offset + 1];
      const blue = data.data[offset + 2];
      const high = Math.max(red, green, blue);
      const low = Math.min(red, green, blue);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      if (luminance >= 142 && high - low <= 72 && green >= red - 38 && blue >= red - 38) {
        hits += 1;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    if (hits >= minHits && right > left) spans.push({ y, left, right });
  }
  if (spans.length < rows * 0.22) return null;
  const top = spans[0].y;
  const bottom = spans.at(-1)!.y;
  if (bottom - top < height * 0.42) return null;
  const band = Math.max(4, Math.round(spans.length * 0.16));
  const topBand = spans.slice(0, band);
  const bottomBand = spans.slice(-band);
  const topLeft = median(topBand.map((span) => span.left));
  const topRight = median(topBand.map((span) => span.right));
  const bottomLeft = median(bottomBand.map((span) => span.left));
  const bottomRight = median(bottomBand.map((span) => span.right));
  const topWidth = topRight - topLeft;
  const bottomWidth = bottomRight - bottomLeft;
  if (Math.min(topWidth, bottomWidth) < width * 0.34) return null;
  return { top, bottom, topLeft, topRight, bottomLeft, bottomRight };
}

function rectify(base: HTMLCanvasElement, geometry: PaperGeometry | null) {
  if (!geometry) {
    const copy = document.createElement("canvas");
    copy.width = base.width;
    copy.height = base.height;
    copy.getContext("2d")?.drawImage(base, 0, 0);
    return { canvas: copy, perspective: false };
  }
  const height = Math.max(1, geometry.bottom - geometry.top);
  const topWidth = geometry.topRight - geometry.topLeft;
  const bottomWidth = geometry.bottomRight - geometry.bottomLeft;
  const targetWidth = Math.max(1, Math.round((topWidth + bottomWidth) / 2));
  const marginX = Math.round(targetWidth * 0.06);
  const marginY = Math.round(height * 0.06);
  const output = document.createElement("canvas");
  output.width = targetWidth + marginX * 2;
  output.height = height + marginY * 2;
  const context = output.getContext("2d");
  if (!context) throw new Error("Canvas no disponible");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, output.width, output.height);
  const strip = Math.max(1, Math.round(height / 900));
  for (let destinationY = 0; destinationY < height; destinationY += strip) {
    const ratio = destinationY / Math.max(1, height - 1);
    const left = geometry.topLeft + (geometry.bottomLeft - geometry.topLeft) * ratio;
    const right = geometry.topRight + (geometry.bottomRight - geometry.topRight) * ratio;
    const sourceY = geometry.top + destinationY;
    const sourceHeight = Math.min(strip, height - destinationY);
    context.drawImage(
      base,
      left,
      sourceY,
      Math.max(1, right - left),
      sourceHeight,
      marginX,
      marginY + destinationY,
      targetWidth,
      sourceHeight,
    );
  }
  return {
    canvas: output,
    perspective:
      Math.abs(topWidth - bottomWidth) > Math.max(12, targetWidth * 0.025) ||
      Math.abs(geometry.topLeft - geometry.bottomLeft) > Math.max(12, targetWidth * 0.025),
  };
}

function deskew(source: HTMLCanvasElement) {
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return { canvas: source, angle: 0 };
  sampleContext.drawImage(source, 0, 0, width, height);
  const data = sampleContext.getImageData(0, 0, width, height);
  const points: Array<{ x: number; y: number }> = [];
  const stride = Math.max(1, Math.round(Math.max(width, height) / 700));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      const luminance = data.data[offset] * 0.2126 + data.data[offset + 1] * 0.7152 + data.data[offset + 2] * 0.0722;
      if (luminance < 155) points.push({ x, y });
    }
  }
  if (points.length > 18000) {
    const every = Math.ceil(points.length / 18000);
    for (let index = points.length - 1; index >= 0; index -= 1) {
      if (index % every !== 0) points.splice(index, 1);
    }
  }
  const angle = estimateDeskewFromSamples(points, width, height);
  if (!angle) return { canvas: source, angle: 0 };
  const radians = (-angle * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const output = document.createElement("canvas");
  output.width = Math.ceil(source.width * cosine + source.height * sine);
  output.height = Math.ceil(source.height * cosine + source.width * sine);
  const context = output.getContext("2d");
  if (!context) return { canvas: source, angle: 0 };
  context.fillStyle = "#fff";
  context.fillRect(0, 0, output.width, output.height);
  context.translate(output.width / 2, output.height / 2);
  context.rotate(radians);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return { canvas: output, angle };
}

async function variants(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.max(1, 2100 / Math.max(1, bitmap.width));
    if (bitmap.width * scale > 2800) scale = 2800 / bitmap.width;
    if (bitmap.height * scale > 5200) scale = Math.min(scale, 5200 / bitmap.height);
    const fullWidth = Math.round(bitmap.width * scale);
    const fullHeight = Math.round(bitmap.height * scale);
    const base = document.createElement("canvas");
    base.width = fullWidth;
    base.height = fullHeight;
    const baseContext = base.getContext("2d", { willReadFrequently: true });
    if (!baseContext) throw new Error("Canvas no disponible");
    baseContext.fillStyle = "#fff";
    baseContext.fillRect(0, 0, fullWidth, fullHeight);
    baseContext.drawImage(bitmap, 0, 0, fullWidth, fullHeight);
    const geometry = paperGeometry(baseContext.getImageData(0, 0, fullWidth, fullHeight), fullWidth, fullHeight);
    const rectified = rectify(base, geometry);
    const straight = deskew(rectified.canvas);
    const natural = straight.canvas;
    const width = natural.width;
    const height = natural.height;
    const context = natural.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas no disponible");
    const data = context.getImageData(0, 0, width, height);
    const grayscale = new Uint8ClampedArray(data.data.length);
    for (let offset = 0; offset < data.data.length; offset += 4) {
      const value = Math.round(data.data[offset] * 0.2126 + data.data[offset + 1] * 0.7152 + data.data[offset + 2] * 0.0722);
      grayscale[offset] = grayscale[offset + 1] = grayscale[offset + 2] = value;
      grayscale[offset + 3] = 255;
    }
    const enhanced = document.createElement("canvas");
    enhanced.width = width;
    enhanced.height = height;
    enhanced.getContext("2d")?.putImageData(new ImageData(grayscale, width, height), 0, 0);
    const adaptive = new Uint8ClampedArray(grayscale);
    const blockSize = Math.max(64, Math.round(Math.min(width, height) / 18));
    for (let blockY = 0; blockY < height; blockY += blockSize) {
      for (let blockX = 0; blockX < width; blockX += blockSize) {
        const endX = Math.min(width, blockX + blockSize);
        const endY = Math.min(height, blockY + blockSize);
        let sum = 0;
        let count = 0;
        for (let y = blockY; y < endY; y += 2) {
          for (let x = blockX; x < endX; x += 2) {
            sum += grayscale[(y * width + x) * 4];
            count += 1;
          }
        }
        const threshold = clamp(Math.round(sum / Math.max(1, count)) - 18, 118, 220);
        for (let y = blockY; y < endY; y += 1) {
          for (let x = blockX; x < endX; x += 1) {
            const offset = (y * width + x) * 4;
            const value = grayscale[offset] < threshold ? 0 : 255;
            adaptive[offset] = adaptive[offset + 1] = adaptive[offset + 2] = value;
            adaptive[offset + 3] = 255;
          }
        }
      }
    }
    const adaptiveCanvas = document.createElement("canvas");
    adaptiveCanvas.width = width;
    adaptiveCanvas.height = height;
    adaptiveCanvas.getContext("2d")?.putImageData(new ImageData(adaptive, width, height), 0, 0);
    return {
      natural,
      enhanced,
      adaptive: adaptiveCanvas,
      deskewAngle: straight.angle,
      perspectiveCorrected: rectified.perspective,
    };
  } finally {
    bitmap.close();
  }
}

async function read(worker: Worker, input: HTMLCanvasElement | File, pageSegmentationMode: string) {
  await worker.setParameters?.({
    tessedit_pageseg_mode: pageSegmentationMode,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  const result = await worker.recognize(input, {}, { text: true, tsv: true });
  const raw = String(result.data?.text || "");
  const structured = reconstructTsvReceipt(String(result.data?.tsv || ""));
  return {
    text: repair(structured?.text || normalizeOcrText(raw)),
    layoutText: structured?.layoutText || preserveOcrLayout(raw),
    confidence: Number.isFinite(result.data?.confidence) ? Number(result.data?.confidence) : null,
  };
}

export function scoreReceiptCandidate(text: string, confidence: number | null, hint: DocumentTypeHint) {
  const cleaned = normalizeOcrText(repair(text));
  const characters = visibleChars(cleaned);
  if (characters < 20) return (confidence ?? 0) * 0.15 - 35 + characters * 0.35;
  const metadata = inferDocumentMetadata(cleaned, hint);
  const lines = cleaned.split(/\r?\n/).filter(Boolean).length;
  const decimals = (cleaned.match(/\d+[.,]\d{2}\b/g) || []).length;
  let score = (confidence ?? 0) * 0.8;
  score += Math.min(25, characters / 20);
  score += Math.min(10, lines * 0.65);
  score += Math.min(7, decimals * 0.7);
  if (metadata.documentDate) score += 6;
  if (metadata.amount !== null) score += 8;
  if (metadata.merchant) score += 4;
  if (/\bTOTAL\b/i.test(cleaned)) score += 4;
  return score;
}

export function shouldRefineReceiptCandidates(candidates: Array<{ text: string; confidence: number | null }>, hint: DocumentTypeHint) {
  if (candidates.length < 2) return true;
  const usable = candidates.filter((candidate) => visibleChars(candidate.text) >= 80);
  if (usable.length < candidates.length) return true;
  const confidences = candidates.map((candidate) => candidate.confidence).filter((value): value is number => value !== null);
  if (confidences.length >= 2 && Math.max(...confidences) - Math.min(...confidences) >= 12) return true;
  const best = candidates.reduce((current, candidate) =>
    scoreReceiptCandidate(candidate.text, candidate.confidence, hint) > scoreReceiptCandidate(current.text, current.confidence, hint)
      ? candidate
      : current,
  );
  const metadata = inferDocumentMetadata(best.text, hint);
  return !metadata.documentDate || metadata.amount === null || !metadata.merchant;
}

function addCandidate(candidates: Candidate[], variant: string, result: { text: string; layoutText: string; confidence: number | null }, hint: DocumentTypeHint) {
  candidates.push({ variant, ...result, score: scoreReceiptCandidate(result.text, result.confidence, hint) });
}

export async function recognizeTicketImage(
  file: File,
  worker: Worker,
  onProgress: (value: number, label: string) => void,
  hint: DocumentTypeHint = null,
): Promise<ImageOcrResult> {
  const candidates: Candidate[] = [];
  let deskewAngle = 0;
  let perspectiveCorrected = false;
  try {
    onProgress(0.06, "Detectando bordes del ticket");
    const prepared = await variants(file);
    deskewAngle = prepared.deskewAngle;
    perspectiveCorrected = prepared.perspectiveCorrected;
    onProgress(0.2, perspectiveCorrected || deskewAngle ? "Corrigiendo perspectiva y giro" : "Preparando contraste del ticket");

    onProgress(0.31, "Escaneando ticket · contraste adaptativo");
    addCandidate(candidates, "adaptive_rectified_tsv", await read(worker, prepared.adaptive, "6"), hint);

    onProgress(0.56, "Escaneando ticket · columnas y precios");
    addCandidate(candidates, "columns_rectified_tsv", await read(worker, prepared.enhanced, "4"), hint);

    if (shouldRefineReceiptCandidates(candidates, hint)) {
      onProgress(0.76, "Contrastando una tercera lectura");
      addCandidate(candidates, "natural_rectified_tsv", await read(worker, prepared.natural, "6"), hint);
    }

    const preliminary = candidates.reduce((current, candidate) => (candidate.score > current.score ? candidate : current));
    const metadata = inferDocumentMetadata(preliminary.text, hint);
    if (!metadata.documentDate || metadata.amount === null || !metadata.merchant || visibleChars(preliminary.text) < 100) {
      onProgress(0.87, "Afinando caracteres dudosos");
      addCandidate(candidates, "block_rectified_tsv", await read(worker, prepared.enhanced, "6"), hint);
    }
  } catch {
    onProgress(0.72, "Leyendo imagen original");
    addCandidate(candidates, "original_tsv", await read(worker, file, "6"), hint);
  }

  const best = candidates.reduce((current, candidate) => (candidate.score > current.score ? candidate : current));
  onProgress(0.97, "Validando comercio, fecha e importe");
  const result = {
    text: best.text,
    layoutText: best.layoutText,
    confidence: best.confidence,
    method: `image_ocr_receipt_v307:${best.variant}`,
    passes: candidates.map(({ variant, confidence, score }) => ({ variant, confidence, score: Math.round(score * 10) / 10 })),
  } as ImageOcrResult & { deskewAngle?: number; perspectiveCorrected?: boolean };
  result.deskewAngle = deskewAngle;
  result.perspectiveCorrected = perspectiveCorrected;
  return result;
}
