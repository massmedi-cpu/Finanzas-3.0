import type { DocumentOcrProvider } from "../../application/document-ocr-service";
import type { OcrWord } from "../../domain/document-ocr";

const MAX_PAGES = 16;
const EXTRACTOR = "pdfjs-6.2.108-native-text";

type PdfTextItem = {
  str?: unknown;
  width?: unknown;
  height?: unknown;
  transform?: unknown;
};

function unit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function wordsFromContent(
  items: unknown[],
  viewport: { width: number; height: number; transform: number[] },
  transformPoint: (a: number[], b: number[]) => number[],
): OcrWord[] {
  const words: OcrWord[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as PdfTextItem;
    const text = typeof item.str === "string" ? item.str.replace(/\s+/g, " ").trim() : "";
    const matrix = Array.isArray(item.transform) ? item.transform.map(Number) : [];
    if (!text || matrix.length !== 6 || !matrix.every(Number.isFinite)) continue;

    const transformed = transformPoint(viewport.transform, matrix);
    if (transformed.length < 6 || !transformed.every(Number.isFinite)) continue;
    const fontHeight = Math.max(1, Math.hypot(transformed[2], transformed[3]));
    const rawWidth = Number(item.width);
    const widthPx = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : Math.max(fontHeight, text.length * fontHeight * 0.45);
    const left = Math.max(0, transformed[4]);
    const top = Math.max(0, transformed[5] - fontHeight);
    const right = Math.min(viewport.width, left + widthPx);
    const bottom = Math.min(viewport.height, top + Math.max(fontHeight, Number(item.height) || 0));
    if (right <= left || bottom <= top || viewport.width <= 0 || viewport.height <= 0) continue;

    const x = unit(left / viewport.width);
    const y = unit(top / viewport.height);
    const width = Math.min(1 - x, Math.max(0.000001, (right - left) / viewport.width));
    const height = Math.min(1 - y, Math.max(0.000001, (bottom - top) / viewport.height));
    words.push({ text, confidence: 1, box: { x, y, width, height } });
  }
  return words;
}

export class PdfTextOcrProvider implements DocumentOcrProvider {
  supports(mimeType: string) {
    return mimeType.toLowerCase() === "application/pdf";
  }

  async extract(input: { bytes: Uint8Array; mimeType: string; originalFileName: string }) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: new Uint8Array(input.bytes),
      useSystemFonts: true,
    });
    const pdf = await task.promise;
    const pageCount = Math.min(pdf.numPages, MAX_PAGES);
    const pages: Array<{ pageNumber: number; words: OcrWord[] }> = [];
    const warnings: string[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        try {
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const words = wordsFromContent(
            content.items as unknown[],
            { width: viewport.width, height: viewport.height, transform: [...viewport.transform] },
            pdfjs.Util.transform,
          );
          pages.push({ pageNumber, words });
          if (!words.length) warnings.push(`pdf_page_requires_visual_ocr:${pageNumber}`);
        } finally {
          try { page.cleanup(); } catch { /* best effort */ }
        }
      }
      if (pdf.numPages > MAX_PAGES) warnings.push("pdf_page_limit_reached");
      return {
        source: "pdf_text" as const,
        extractor: EXTRACTOR,
        pages,
        warnings,
      };
    } finally {
      await task.destroy().catch(() => undefined);
    }
  }
}
