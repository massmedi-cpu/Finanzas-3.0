import {
  buildDocumentOcrResult,
  reconstructOcrPage,
  type DocumentOcrResult,
  type OcrSource,
  type OcrWord,
} from "../domain/document-ocr";

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 16;
const SUPPORTED_MIMES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export type DocumentOcrProviderPage = {
  pageNumber: number;
  words: OcrWord[];
};

export type DocumentOcrProviderOutput = {
  source: OcrSource;
  extractor: string;
  pages: DocumentOcrProviderPage[];
  warnings?: string[];
};

export type DocumentOcrProvider = {
  supports(mimeType: string): boolean;
  extract(input: {
    bytes: Uint8Array;
    mimeType: string;
    originalFileName: string;
  }): Promise<DocumentOcrProviderOutput>;
};

export type RunDocumentOcrInput = {
  documentId: string;
  bytes: Uint8Array;
  mimeType: string;
  originalFileName: string;
  provider: DocumentOcrProvider;
  now?: () => Date;
};

function cleanMime(value: string) {
  return value.trim().toLowerCase();
}

function cleanFileName(value: string) {
  const result = value.trim();
  if (!result || result.length > 500) throw new Error("invalid_ocr_file_name");
  return result;
}

export async function runDocumentOcr(input: RunDocumentOcrInput): Promise<DocumentOcrResult> {
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error("invalid_ocr_file_size");
  }
  const mimeType = cleanMime(input.mimeType);
  if (!SUPPORTED_MIMES.has(mimeType)) throw new Error("unsupported_ocr_mime_type");
  if (!input.provider.supports(mimeType)) throw new Error("ocr_provider_unsupported_mime");
  const originalFileName = cleanFileName(input.originalFileName);

  const output = await input.provider.extract({ bytes: input.bytes, mimeType, originalFileName });
  if (!output.extractor.trim() || output.extractor.length > 100) throw new Error("invalid_ocr_extractor");
  if (!output.pages.length || output.pages.length > MAX_PAGES) throw new Error("invalid_ocr_pages");

  const seen = new Set<number>();
  const pages = output.pages.map((page) => {
    if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 || page.pageNumber > MAX_PAGES || seen.has(page.pageNumber)) {
      throw new Error("invalid_ocr_pages");
    }
    seen.add(page.pageNumber);
    return reconstructOcrPage(page.pageNumber, page.words);
  });

  const sortedPageNumbers = [...seen].sort((a, b) => a - b);
  const coverageWarnings = sortedPageNumbers.some((pageNumber, index) => pageNumber !== index + 1)
    ? ["incomplete_page_coverage"]
    : [];

  return buildDocumentOcrResult({
    documentId: input.documentId,
    source: output.source,
    extractor: output.extractor,
    extractedAt: (input.now ?? (() => new Date()))().toISOString(),
    pages,
    warnings: [...(output.warnings ?? []), ...coverageWarnings],
  });
}
