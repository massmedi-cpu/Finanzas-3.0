export type DocumentTypeHint = "receipt" | null;

type Recognition = { data?: { text?: string; confidence?: number } };
type OcrWorker = {
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (input: File | HTMLCanvasElement) => Promise<Recognition>;
};

export type DocumentMetadata = {
  documentType: string;
  documentDate: string | null;
  amount: number | null;
  merchant: string | null;
  lines: string[];
};

export type ImageOcrResult = {
  text: string;
  confidence: number | null;
  method: string;
  passes: Array<{ variant: string; confidence: number | null; score: number }>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanLine(value: string) {
  return value.replace(/[|¦]/g, "I").replace(/\s{2,}/g, " ").trim();
}

function usefulLine(value: string) {
  const line = cleanLine(value);
  if (line.length < 2) return false;
  const visible = line.replace(/\s/g, "");
  if (!visible) return false;
  const alphaNumeric = (visible.match(/[\p{L}\d]/gu) || []).length;
  return alphaNumeric / visible.length >= 0.45;
}

export function normalizeOcrText(text: string) {
  return text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(usefulLine)
    .join("\n")
    .trim();
}

export function parseEuroValue(raw: string) {
  const compact = raw.replace(/\s/g, "").replace(/[€EUR]/gi, "");
  let normalized = compact;
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma > dot) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else if (dot > comma && comma >= 0) normalized = normalized.replace(/,/g, "");
  else if (comma >= 0) normalized = normalized.replace(",", ".");
  normalized = normalized.replace(/[^0-9.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseDate(text: string) {
  const patterns = [
    /\b([0-3]?\d)[\/.-]([01]?\d)[\/.-]((?:19|20)?\d{2})\b/,
    /\b((?:19|20)\d{2})[\/.-]([01]?\d)[\/.-]([0-3]?\d)\b/,
  ];
  for (let index = 0; index < patterns.length; index += 1) {
    const match = text.match(patterns[index]);
    if (!match) continue;
    let day: number;
    let month: number;
    let year: number;
    if (index === 0) {
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
      if (year < 100) year += 2000;
    } else {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    }
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

function extractAmounts(line: string) {
  const matches = line.match(/-?\d{1,5}(?:[.\s]\d{3})*(?:,\d{2}|\.\d{2})(?:\s*(?:€|EUR))?/gi) || [];
  return matches
    .map(parseEuroValue)
    .filter((value): value is number => value !== null && Math.abs(value) < 1_000_000);
}

function likelyMerchant(lines: string[]) {
  const blocked = /(factura|ticket|recibo|fecha|hora|total|subtotal|iva|base|cif|nif|nº|num\.?|importe|pago|tarjeta|cambio|efectivo|gracias|cliente|copia|documento|unidades?|precio)/i;
  let best: { line: string; score: number } | null = null;
  for (const [index, raw] of lines.slice(0, 18).entries()) {
    const line = cleanLine(raw);
    if (line.length < 3 || line.length > 72 || blocked.test(line)) continue;
    const letters = (line.match(/\p{L}/gu) || []).length;
    const digits = (line.match(/\d/g) || []).length;
    const symbols = line.replace(/[\p{L}\d\s]/gu, "").length;
    if (letters < 3 || symbols > Math.max(4, line.length * 0.25)) continue;
    let score = letters * 1.4 - digits * 0.7 - symbols * 1.2 - index * 0.45;
    if (line === line.toUpperCase() && letters >= 5) score += 5;
    if (/\b(SL|S\.L\.|SA|S\.A\.|BAR|CAFE|CAFÉ|RESTAURANTE|SUPERMERCADO|ESTANCO|FARMACIA|TIENDA)\b/i.test(line)) score += 8;
    if (!best || score > best.score) best = { line, score };
  }
  return best?.line || null;
}

export function inferDocumentMetadata(rawText: string, hint: DocumentTypeHint = null): DocumentMetadata {
  const text = normalizeOcrText(rawText);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const lower = text.toLowerCase();
  let documentType = hint || "other";
  if (/\bfactura\b/.test(lower)) documentType = "invoice";
  else if (/\b(ticket|recibo|justificante|tique)\b/.test(lower) || hint === "receipt") documentType = "receipt";
  else if (/\bcontrato\b/.test(lower)) documentType = "contract";
  else if (/\bextracto\b/.test(lower)) documentType = "statement";
  else if (/\b(irpf|iva|impuesto|tribut)\b/.test(lower)) documentType = "tax";

  const documentDate = parseDate(text);
  const totalMatchers = [
    /\b(total\s*(?:a\s*pagar)?|importe\s*total|a\s*pagar|total\s*ticket)\b/i,
    /\b(importe|pagado|tarjeta|efectivo)\b/i,
  ];
  let amount: number | null = null;
  for (const matcher of totalMatchers) {
    const matching = lines.filter((line) => matcher.test(line));
    const amounts = matching.flatMap(extractAmounts);
    if (amounts.length) {
      amount = amounts[amounts.length - 1];
      break;
    }
  }
  if (amount === null) {
    const euroAmounts = lines.filter((line) => /€|EUR/i.test(line)).flatMap(extractAmounts);
    if (euroAmounts.length) amount = euroAmounts.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, euroAmounts[0]);
  }
  if (amount === null) {
    const allAmounts = lines.flatMap(extractAmounts).filter((value) => Math.abs(value) <= 100_000);
    if (allAmounts.length) amount = allAmounts.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, allAmounts[0]);
  }

  return { documentType, documentDate, amount, merchant: likelyMerchant(lines), lines };
}

function percentile(histogram: Uint32Array, total: number, ratio: number) {
  const target = total * ratio;
  let sum = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    sum += histogram[index];
    if (sum >= target) return index;
  }
  return 255;
}

function otsuThreshold(histogram: Uint32Array, total: number) {
  let sum = 0;
  for (let index = 0; index < 256; index += 1) sum += index * histogram[index];
  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = -1;
  let threshold = 180;
  for (let index = 0; index < 256; index += 1) {
    weightBackground += histogram[index];
    if (!weightBackground) continue;
    const weightForeground = total - weightBackground;
    if (!weightForeground) break;
    sumBackground += index * histogram[index];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = index;
    }
  }
  return clamp(threshold, 115, 220);
}

async function imageVariants(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.max(1, 1600 / Math.max(1, bitmap.width));
    if (bitmap.width * scale > 2400) scale = 2400 / bitmap.width;
    if (bitmap.height * scale > 4200) scale = Math.min(scale, 4200 / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const base = document.createElement("canvas");
    base.width = width;
    base.height = height;
    const context = base.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas no disponible");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const source = context.getImageData(0, 0, width, height);
    const grayscale = new Uint8ClampedArray(source.data.length);
    const histogram = new Uint32Array(256);
    const pixels = width * height;
    for (let offset = 0; offset < source.data.length; offset += 4) {
      const value = Math.round(source.data[offset] * 0.2126 + source.data[offset + 1] * 0.7152 + source.data[offset + 2] * 0.0722);
      histogram[value] += 1;
    }
    const low = percentile(histogram, pixels, 0.015);
    const high = Math.max(low + 24, percentile(histogram, pixels, 0.985));
    const stretchedHistogram = new Uint32Array(256);
    for (let offset = 0; offset < source.data.length; offset += 4) {
      const raw = Math.round(source.data[offset] * 0.2126 + source.data[offset + 1] * 0.7152 + source.data[offset + 2] * 0.0722);
      const value = clamp(Math.round(((raw - low) * 255) / (high - low)), 0, 255);
      stretchedHistogram[value] += 1;
      grayscale[offset] = value;
      grayscale[offset + 1] = value;
      grayscale[offset + 2] = value;
      grayscale[offset + 3] = 255;
    }
    const enhanced = document.createElement("canvas");
    enhanced.width = width;
    enhanced.height = height;
    enhanced.getContext("2d")?.putImageData(new ImageData(grayscale, width, height), 0, 0);

    const threshold = otsuThreshold(stretchedHistogram, pixels);
    const binaryPixels = new Uint8ClampedArray(grayscale);
    for (let offset = 0; offset < binaryPixels.length; offset += 4) {
      const value = binaryPixels[offset] < threshold ? 0 : 255;
      binaryPixels[offset] = value;
      binaryPixels[offset + 1] = value;
      binaryPixels[offset + 2] = value;
    }
    const binary = document.createElement("canvas");
    binary.width = width;
    binary.height = height;
    binary.getContext("2d")?.putImageData(new ImageData(binaryPixels, width, height), 0, 0);
    return { enhanced, binary, width, height, threshold };
  } finally {
    bitmap.close();
  }
}

function candidateScore(text: string, confidence: number | null, hint: DocumentTypeHint) {
  const cleaned = normalizeOcrText(text);
  const metadata = inferDocumentMetadata(cleaned, hint);
  const lines = metadata.lines;
  const readable = lines.filter(usefulLine).length;
  let score = confidence ?? 0;
  score += Math.min(18, cleaned.length / 55);
  score += Math.min(10, readable * 0.6);
  if (metadata.documentDate) score += 16;
  if (metadata.amount !== null) score += 20;
  if (metadata.merchant) score += 12;
  if (hint === "receipt" && metadata.documentType === "receipt") score += 4;
  return score;
}

async function recognize(worker: OcrWorker, input: File | HTMLCanvasElement, psm: string) {
  await worker.setParameters?.({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  const result = await worker.recognize(input);
  return {
    text: normalizeOcrText(String(result.data?.text || "")),
    confidence: Number.isFinite(result.data?.confidence) ? Number(result.data?.confidence) : null,
  };
}

export async function recognizeTicketImage(
  file: File,
  worker: OcrWorker,
  onProgress: (value: number, label: string) => void,
  hint: DocumentTypeHint = null,
): Promise<ImageOcrResult> {
  const passes: Array<{ variant: string; text: string; confidence: number | null; score: number }> = [];
  let variants: Awaited<ReturnType<typeof imageVariants>> | null = null;
  try {
    onProgress(0.1, "Mejorando contraste del ticket");
    variants = await imageVariants(file);
    onProgress(0.28, "Leyendo ticket · pasada 1 de 2");
    const enhanced = await recognize(worker, variants.enhanced, "6");
    passes.push({ variant: "enhanced_block", ...enhanced, score: candidateScore(enhanced.text, enhanced.confidence, hint) });

    const firstMeta = inferDocumentMetadata(enhanced.text, hint);
    const firstLooksGood = (enhanced.confidence ?? 0) >= 72 && Boolean(firstMeta.documentDate) && firstMeta.amount !== null && Boolean(firstMeta.merchant) && enhanced.text.length >= 80;
    if (!firstLooksGood) {
      onProgress(0.64, "Leyendo ticket · pasada 2 de 2");
      const sparse = await recognize(worker, variants.binary, "11");
      passes.push({ variant: "binary_sparse", ...sparse, score: candidateScore(sparse.text, sparse.confidence, hint) });
    }
  } catch {
    onProgress(0.45, "Leyendo imagen original");
  }

  if (!passes.length || Math.max(...passes.map((item) => item.score)) < 82) {
    onProgress(0.78, "Comprobando lectura original");
    const original = await recognize(worker, file, "6");
    passes.push({ variant: "original_block", ...original, score: candidateScore(original.text, original.confidence, hint) });
  }
  const best = passes.reduce((winner, item) => item.score > winner.score ? item : winner, passes[0]);
  onProgress(0.96, "Interpretando fecha, comercio e importe");
  return {
    text: best.text,
    confidence: best.confidence,
    method: `image_ocr_multi:${best.variant}`,
    passes: passes.map(({ variant, confidence, score }) => ({ variant, confidence, score: Math.round(score * 10) / 10 })),
  };
}
