import type { DocumentOcrProvider } from "../../application/document-ocr-service";
import type { OcrSource, OcrWord } from "../../domain/document-ocr";
import { TesseractImageOcrProvider } from "./tesseract-image-provider";

const MAX_PAGES = 16;
const MAX_RENDER_SIDE = 2800;
const MAX_RENDER_SCALE = 2.5;
const EXTRACTOR_NATIVE = "pdfjs-6.2.108-native-text";
const EXTRACTOR_HYBRID = "pdfjs-6.2.108+tesseract-js-7.0.0-spa";

type PdfTextItem = {
  str?: unknown;
  width?: unknown;
  height?: unknown;
  transform?: unknown;
};

type PdfCanvasFactory = {
  create(width: number, height: number): {
    canvas: { toBuffer(mimeType?: string): Buffer | Uint8Array };
    context: unknown;
  };
  destroy?(target: unknown): void;
};

type PdfWithCanvas = {
  canvasFactory?: PdfCanvasFactory;
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

async function renderPagePng(
  pdf: PdfWithCanvas,
  page: {
    getViewport(options: { scale: number }): { width: number; height: number };
    render(options: Record<string, unknown>): { promise: Promise<unknown> };
  },
) {
  const canvasFactory = pdf.canvasFactory;
  if (!canvasFactory?.create) throw new Error("ocr_pdf_canvas_unavailable");
  const base = page.getViewport({ scale: 1 });
  const longest = Math.max(base.width, base.height, 1);
  const scale = Math.max(0.75, Math.min(MAX_RENDER_SCALE, MAX_RENDER_SIDE / longest));
  const viewport = page.getViewport({ scale });
  const rendered = canvasFactory.create(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
  try {
    await page.render({ canvasContext: rendered.context, viewport, canvasFactory }).promise;
    const png = Buffer.from(rendered.canvas.toBuffer("image/png"));
    if (!png.byteLength) throw new Error("ocr_pdf_render_empty");
    return png;
  } finally {
    try { canvasFactory.destroy?.(rendered); } catch { /* best effort */ }
  }
}

export class PdfTextOcrProvider implements DocumentOcrProvider {
  private readonly imageOcr = new TesseractImageOcrProvider();

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
    let nativePageCount = 0;
    let visualOcrPageCount = 0;

    try {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        try {
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const nativeWords = wordsFromContent(
            content.items as unknown[],
            { width: viewport.width, height: viewport.height, transform: [...viewport.transform] },
            pdfjs.Util.transform,
          );

          if (nativeWords.length) {
            nativePageCount += 1;
            pages.push({ pageNumber, words: nativeWords });
            continue;
          }

          const png = await renderPagePng(pdf as unknown as PdfWithCanvas, page as unknown as Parameters<typeof renderPagePng>[1]);
          const visual = await this.imageOcr.extract({
            bytes: new Uint8Array(png),
            mimeType: "image/png",
            originalFileName: `${input.originalFileName}.page-${pageNumber}.png`,
          });
          const visualWords = visual.pages[0]?.words ?? [];
          if (visualWords.length) {
            visualOcrPageCount += 1;
            pages.push({ pageNumber, words: visualWords });
          } else {
            pages.push({ pageNumber, words: [] });
            warnings.push(`pdf_page_visual_ocr_empty:${pageNumber}`);
          }
          for (const warning of visual.warnings ?? []) warnings.push(`pdf_page_${pageNumber}:${warning}`);
        } finally {
          try { page.cleanup(); } catch { /* best effort */ }
        }
      }
      if (pdf.numPages > MAX_PAGES) warnings.push("pdf_page_limit_reached");

      let source: OcrSource = "pdf_text";
      if (visualOcrPageCount && nativePageCount) source = "hybrid";
      else if (visualOcrPageCount) source = "pdf_ocr";

      return {
        source,
        extractor: visualOcrPageCount ? EXTRACTOR_HYBRID : EXTRACTOR_NATIVE,
        pages,
        warnings,
      };
    } finally {
      await task.destroy().catch(() => undefined);
    }
  }
}
