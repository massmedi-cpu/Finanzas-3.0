import type { DocumentOcrProvider } from "../../application/document-ocr-service";
import type { OcrWord } from "../../domain/document-ocr";
import { resolvePdfOcrSource } from "./pdf-source-provenance";
import { TesseractImageOcrProvider } from "./tesseract-image-provider";
import { pdfNativeTextNeedsVisualOcr, pdfVisualOcrImprovesNative } from "./pdf-native-coverage";
import { pdfRasterScale } from "./pdf-render-geometry";

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
  const scale = pdfRasterScale(base.width, base.height, MAX_RENDER_SIDE, MAX_RENDER_SCALE);
  const viewport = page.getViewport({ scale });
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)
    || viewport.width <= 0 || viewport.height <= 0
    || viewport.width > MAX_RENDER_SIDE + 1 || viewport.height > MAX_RENDER_SIDE + 1) {
    throw new Error("ocr_pdf_page_dimensions_invalid");
  }
  const rendered = canvasFactory.create(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
  try {
    // PDF.js 6.x requires the actual canvas; canvasContext alone is not a
    // valid substitute for the render target in Node.
    await page.render({ canvas: rendered.canvas, canvasContext: rendered.context, viewport, canvasFactory }).promise;
    const png = Buffer.from(rendered.canvas.toBuffer("image/png"));
    if (!png.byteLength) throw new Error("ocr_pdf_render_empty");
    return png;
  } finally {
    try { canvasFactory.destroy?.(rendered); } catch { /* best effort */ }
  }
}

export class PdfTextOcrProvider implements DocumentOcrProvider {
  // Injection is intentionally limited to the visual extractor: a failing
  // scanned page can be exercised without disabling the real PDF.js parser.
  constructor(
    private readonly imageOcr: Pick<DocumentOcrProvider, "extract"> = new TesseractImageOcrProvider(),
  ) {}

  supports(mimeType: string) {
    return mimeType.toLowerCase() === "application/pdf";
  }

  // Keep native extraction isolatable per page. PDF.js can fail to parse a
  // damaged text stream even when the page can still be rasterized. One bad
  // text stream must not erase other pages or suppress visual recovery.
  protected async readNativeItems(
    page: { getTextContent(): Promise<{ items: unknown[] }> },
    _pageNumber: number,
  ): Promise<unknown[]> {
    const content = await page.getTextContent();
    return content.items;
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
    let visualOcrAttempted = 0;

    try {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        try {
          const viewport = page.getViewport({ scale: 1 });
          let nativeWords: OcrWord[] = [];
          try {
            const items = await this.readNativeItems(page, pageNumber);
            nativeWords = wordsFromContent(
              items,
              { width: viewport.width, height: viewport.height, transform: [...viewport.transform] },
              pdfjs.Util.transform,
            );
          } catch {
            // The text stream is not proof that the raster is unusable.
            // Preserve the page number, mark native extraction uncertain,
            // and attempt the same bounded visual OCR used for scanned pages.
            warnings.push(`pdf_page_native_text_failed:${pageNumber}`);
          }

          if (!pdfNativeTextNeedsVisualOcr(nativeWords)) {
            nativePageCount += 1;
            pages.push({ pageNumber, words: nativeWords });
            continue;
          }

          visualOcrAttempted += 1;
          // A PDF with only selectable boilerplate may otherwise bypass OCR
          // on a fully scanned invoice. Keep the original native words if
          // the visual pass fails or produces less usable content.
          try {
            const png = await renderPagePng(pdf as unknown as PdfWithCanvas, page as unknown as Parameters<typeof renderPagePng>[1]);
            const visual = await this.imageOcr.extract({
              bytes: new Uint8Array(png),
              mimeType: "image/png",
              originalFileName: `${input.originalFileName}.page-${pageNumber}.png`,
            });
            const visualWords = visual.pages[0]?.words ?? [];
            const improved = pdfVisualOcrImprovesNative(nativeWords, visualWords);
            if (improved) {
              visualOcrPageCount += 1;
              pages.push({ pageNumber, words: visualWords });
              if (nativeWords.length) warnings.push(`pdf_page_sparse_native_recovered:${pageNumber}`);
            } else if (nativeWords.length) {
              nativePageCount += 1;
              pages.push({ pageNumber, words: nativeWords });
              warnings.push(`pdf_page_sparse_native_unverified:${pageNumber}`);
            } else {
              pages.push({ pageNumber, words: [] });
              warnings.push(`pdf_page_visual_ocr_empty:${pageNumber}`);
            }
            for (const warning of visual.warnings ?? []) warnings.push(`pdf_page_${pageNumber}:${warning}`);
          } catch {
            // Failure of one visual page must not discard the native content
            // already recovered from other pages. Never fabricate a word or
            // call a failed OCR pass successful: mark the page explicitly for
            // human inspection and preserve its sequential page number.
            if (!nativeWords.length) {
              pages.push({ pageNumber, words: [] });
              warnings.push(`pdf_page_visual_ocr_failed:${pageNumber}`);
            } else {
              nativePageCount += 1;
              pages.push({ pageNumber, words: nativeWords });
              warnings.push(`pdf_page_sparse_native_unverified:${pageNumber}`);
            }
          }
        } finally {
          try { page.cleanup(); } catch { /* best effort */ }
        }
      }
      if (pdf.numPages > MAX_PAGES) warnings.push("pdf_page_limit_reached");

      // A fully scanned PDF whose visual OCR produced no words is NOT a PDF
      // with usable native text. Preserve that distinction when displaying
      // diagnostics; the page warnings still require human review.
      const source = resolvePdfOcrSource({ nativePageCount, visualOcrPageCount, visualOcrAttempted });

      return {
        source,
        extractor: visualOcrAttempted > 0 ? EXTRACTOR_HYBRID : EXTRACTOR_NATIVE,
        pages,
        warnings,
      };
    } finally {
      await task.destroy().catch(() => undefined);
    }
  }
}
