import { runDocumentOcr, type DocumentOcrProvider } from "../../../../src/application/document-ocr-service";
import type { OcrWord } from "../../../../src/domain/document-ocr";
import {
  GoogleDriveDocumentDownloader,
  GoogleDriveDocumentError,
} from "../../../../src/infrastructure/google/google-drive-document-downloader";
import {
  GOOGLE_DOCUMENT_READONLY_SCOPES,
  GoogleServiceAccountAccessTokenProvider,
  GoogleServiceAccountError,
  getGoogleServiceAccountCredentialsFromEnvironment,
} from "../../../../src/infrastructure/google/google-service-account";
import { PdfTextOcrProvider } from "../../../../src/infrastructure/ocr/pdf-text-provider";
import { ReceiptAnchorFilteringImageOcrProvider } from "../../../../src/infrastructure/ocr/receipt-anchor-filter-provider";
import { ReceiptPaddedCellConsensusImageOcrProvider } from "../../../../src/infrastructure/ocr/receipt-padded-cell-consensus-provider";
import { TesseractImageOcrProvider } from "../../../../src/infrastructure/ocr/tesseract-image-provider";
import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;
const SUPABASE_STORAGE_HOST = "btzukbfesxdratqnxuoj.supabase.co";

function normalizeDiagnosticToken(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

type DiagnosticRow = {
  words: OcrWord[];
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
};

function diagnosticCenterX(word: OcrWord) {
  return word.box.x + word.box.width / 2;
}

function diagnosticCenterY(word: OcrWord) {
  return word.box.y + word.box.height / 2;
}

function diagnosticUnion(words: OcrWord[]) {
  const left = Math.min(...words.map((word) => word.box.x));
  const top = Math.min(...words.map((word) => word.box.y));
  const right = Math.max(...words.map((word) => word.box.x + word.box.width));
  const bottom = Math.max(...words.map((word) => word.box.y + word.box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function diagnosticRows(words: OcrWord[]) {
  const sorted = [...words].sort((a, b) => diagnosticCenterY(a) - diagnosticCenterY(b) || a.box.x - b.box.x);
  const clusters: OcrWord[][] = [];
  for (const word of sorted) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < clusters.length; index += 1) {
      const box = diagnosticUnion(clusters[index]);
      const top = Math.max(word.box.y, box.y);
      const bottom = Math.min(word.box.y + word.box.height, box.y + box.height);
      const overlap = Math.max(0, bottom - top) / Math.max(0.000001, Math.min(word.box.height, box.height));
      const distance = Math.abs(diagnosticCenterY(word) - (box.y + box.height / 2));
      const sameRow = overlap >= 0.32 || distance <= Math.max(word.box.height, box.height) * 0.62;
      if (!sameRow || distance >= bestDistance) continue;
      bestIndex = index;
      bestDistance = distance;
    }
    if (bestIndex === -1) clusters.push([word]);
    else clusters[bestIndex].push(word);
  }

  return clusters
    .map((cluster) => {
      const ordered = [...cluster].sort((a, b) => a.box.x - b.box.x);
      const box = diagnosticUnion(ordered);
      return {
        words: ordered,
        ...box,
        text: ordered.map((word) => word.text).join(" "),
      } satisfies DiagnosticRow;
    })
    .sort((a, b) => a.y - b.y);
}

function diagnosticRoles(row: DiagnosticRow) {
  const tokens = row.words.map((word) => normalizeDiagnosticToken(word.text)).filter(Boolean);
  const joined = tokens.join(" ");
  return {
    description: tokens.some((token) => token.startsWith("descrip")) || joined.includes("descripcion"),
    units: tokens.some((token) => token === "uds" || token === "ud" || token.startsWith("unid")),
    price: tokens.some((token) => token.startsWith("precio")),
    amount: tokens.some((token) => token.startsWith("importe")),
  };
}

function diagnosticCombinedRow(rows: DiagnosticRow[]) {
  const words = rows.flatMap((row) => row.words).sort((a, b) => a.box.x - b.box.x);
  const box = diagnosticUnion(words);
  return { words, ...box, text: words.map((word) => word.text).join(" ") } satisfies DiagnosticRow;
}

function diagnosticSummary(row: DiagnosticRow) {
  const normalized = row.words.map((word) => normalizeDiagnosticToken(word.text)).filter(Boolean).join(" ");
  return /\b(base|iva|total|subtotal|pendiente|pago|efectivo|tarjeta|terraza|mesa)\b/.test(normalized);
}

function diagnosticProduct(row: DiagnosticRow) {
  const letters = (row.text.match(/\p{L}/gu) ?? []).length;
  const numeric = row.words.filter((word) => /\d/.test(word.text)).length;
  return letters >= 3 && numeric >= 2;
}

function diagnosticIntersects(row: DiagnosticRow, left: number, right: number) {
  return Math.max(0, Math.min(row.x + row.width, right) - Math.max(row.x, left)) > 0;
}

function structuralDiagnostic(words: OcrWord[]) {
  const rows = diagnosticRows(words);
  let bestScore = 0;
  let header: { start: number; end: number; row: DiagnosticRow; score: number } | null = null;

  for (let start = 0; start < rows.length; start += 1) {
    for (let end = start; end < rows.length && end < start + 3; end += 1) {
      if (end > start) {
        const previous = rows[end - 1];
        const current = rows[end];
        const gap = current.y - (previous.y + previous.height);
        const maxGap = Math.max(0.018, Math.max(previous.height, current.height) * 1.7);
        if (gap > maxGap) break;
      }
      const combined = diagnosticCombinedRow(rows.slice(start, end + 1));
      const roles = diagnosticRoles(combined);
      const score = Object.values(roles).filter(Boolean).length;
      bestScore = Math.max(bestScore, score);
      if (score < 3 || !roles.description || (!roles.price && !roles.amount)) continue;
      if (!header || score > header.score || (score === header.score && end - start < header.end - header.start)) {
        header = { start, end, row: combined, score };
      }
    }
  }

  if (!header) {
    return { rejection: "header_window", rowCount: rows.length, bestHeaderScore: bestScore };
  }

  const productEntries = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => index > header!.end && diagnosticProduct(row))
    .slice(0, 12);
  const summaryEntries = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => index > header!.end && diagnosticSummary(row))
    .slice(0, 10);

  if (productEntries.length < 2 && summaryEntries.length < 2) {
    return {
      rejection: "insufficient_structure_rows",
      rowCount: rows.length,
      bestHeaderScore: header.score,
      productRows: productEntries.length,
      summaryRows: summaryEntries.length,
    };
  }

  const structural = [header.row, ...productEntries.map(({ row }) => row), ...summaryEntries.map(({ row }) => row)];
  const left = Math.max(0, Math.min(...structural.map((row) => row.x)) - 0.022);
  const right = Math.min(1, Math.max(...structural.map((row) => row.x + row.width)) + 0.022);
  const width = right - left;
  if (width < 0.2 || width > 0.92) {
    return {
      rejection: "structural_width",
      rowCount: rows.length,
      bestHeaderScore: header.score,
      productRows: productEntries.length,
      summaryRows: summaryEntries.length,
      width: Number(width.toFixed(3)),
    };
  }

  const startIndex = Math.max(0, header.start - 2);
  const lastStructure = Math.max(
    header.end,
    summaryEntries.length ? Math.max(...summaryEntries.map(({ index }) => index)) : -1,
    productEntries.length ? Math.max(...productEntries.map(({ index }) => index)) : -1,
  );
  const endIndex = Math.min(rows.length - 1, lastStructure + 1);
  const selectedRows = rows.slice(startIndex, endIndex + 1).filter((row) => diagnosticIntersects(row, left, right));
  if (selectedRows.length < 5) {
    return {
      rejection: "selected_rows",
      rowCount: rows.length,
      bestHeaderScore: header.score,
      productRows: productEntries.length,
      summaryRows: summaryEntries.length,
      selectedRows: selectedRows.length,
      width: Number(width.toFixed(3)),
    };
  }

  const top = Math.max(0, Math.min(...selectedRows.map((row) => row.y)) - 0.012);
  const bottom = Math.min(1, Math.max(...selectedRows.map((row) => row.y + row.height)) + 0.018);
  const height = bottom - top;
  if (height < 0.16 || height > 0.98) {
    return {
      rejection: "structural_height",
      rowCount: rows.length,
      bestHeaderScore: header.score,
      productRows: productEntries.length,
      summaryRows: summaryEntries.length,
      selectedRows: selectedRows.length,
      width: Number(width.toFixed(3)),
      height: Number(height.toFixed(3)),
    };
  }

  return {
    rejection: null,
    rowCount: rows.length,
    bestHeaderScore: header.score,
    headerRows: header.end - header.start + 1,
    productRows: productEntries.length,
    summaryRows: summaryEntries.length,
    selectedRows: selectedRows.length,
    width: Number(width.toFixed(3)),
    height: Number(height.toFixed(3)),
  };
}

class PreviewAnchorSignalDiagnosticProvider implements DocumentOcrProvider {
  constructor(private readonly base: DocumentOcrProvider) {}

  supports(mimeType: string) {
    return this.base.supports(mimeType);
  }

  async extract(input: { bytes: Uint8Array; mimeType: string; originalFileName: string }) {
    const output = await this.base.extract(input);
    if (process.env.VERCEL_ENV === "preview" && output.pages.length === 1) {
      const words = output.pages[0]?.words ?? [];
      const tokens = words.map((word) => normalizeDiagnosticToken(word.text)).filter(Boolean);
      const hasPrefix = (prefix: string) => tokens.some((token) => token.startsWith(prefix));
      const numericWords = words.filter((word) => /\d/.test(word.text)).length;
      const averageConfidence = words.length
        ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length
        : 0;

      console.info("ocr-anchor-input-v16", {
        wordCount: words.length,
        numericWords,
        averageConfidence: Number(averageConfidence.toFixed(3)),
        headerSignals: {
          description: hasPrefix("descrip"),
          units: tokens.some((token) => token === "uds" || token === "ud" || token.startsWith("unid")),
          price: hasPrefix("precio"),
          amount: hasPrefix("importe"),
        },
        summarySignals: {
          base: tokens.includes("base"),
          iva: tokens.includes("iva"),
          total: tokens.some((token) => token === "total" || token.startsWith("total")),
        },
        structure: structuralDiagnostic(words),
      });
    }
    return output;
  }
}

// Keep the runtime pipeline flat. The anchor filter is pure geometry/text post-processing and
// does not create another OCR worker. Historical V3-V8 providers remain available for regression
// coverage, but chaining them here creates multiple concurrent Tesseract workers and can exhaust
// the Vercel function memory before the focused cell pass.
const imageProvider = new ReceiptPaddedCellConsensusImageOcrProvider(
  new ReceiptAnchorFilteringImageOcrProvider(
    new PreviewAnchorSignalDiagnosticProvider(new TesseractImageOcrProvider()),
  ),
);
const pdfProvider = new PdfTextOcrProvider();
let googleDriveDownloader: GoogleDriveDocumentDownloader | null = null;

type DocumentDetail = {
  document: {
    id: string;
    mimeType: string;
    originalFileName: string;
    storageProvider: "supabase" | "google_drive";
    sourceDriveFileId: string | null;
  };
};

type DocumentOpen = {
  url: string;
};

class OcrApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: error.status === 404 ? "not_found" : "persistence_failed", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503, headers: HEADERS },
    );
  }
  if (error instanceof OcrApiError) {
    return Response.json({ error: "ocr_failed", code: error.code }, { status: error.status, headers: HEADERS });
  }
  if (error instanceof GoogleDriveDocumentError) {
    const status: Record<GoogleDriveDocumentError["code"], number> = {
      google_drive_document_id_invalid: 409,
      google_drive_document_access_denied: 409,
      google_drive_document_not_found: 404,
      google_drive_document_metadata_invalid: 409,
      google_drive_document_mime_mismatch: 415,
      google_drive_document_content_mismatch: 415,
      google_drive_document_too_large: 413,
      google_drive_document_download_failed: 503,
    };
    return Response.json({ error: "ocr_failed", code: error.code }, { status: status[error.code], headers: HEADERS });
  }
  if (error instanceof GoogleServiceAccountError) {
    return Response.json({ error: "ocr_failed", code: error.code }, { status: 503, headers: HEADERS });
  }
  if (error instanceof Error) {
    const known: Record<string, number> = {
      invalid_ocr_file_size: 413,
      unsupported_ocr_mime_type: 415,
      ocr_provider_unsupported_mime: 415,
      invalid_ocr_file_name: 400,
      invalid_ocr_document_id: 400,
      invalid_ocr_pages: 422,
      invalid_ocr_box: 422,
      ocr_image_signature_mismatch: 415,
      ocr_image_dimensions_too_large: 413,
      ocr_queue_timeout: 503,
      ocr_worker_timeout: 503,
      ocr_recognize_timeout: 503,
      InvalidPDFException: 422,
      PasswordException: 422,
    };
    const status = known[error.message] ?? known[error.name];
    if (status) return Response.json({ error: "ocr_failed", code: error.message || error.name }, { status, headers: HEADERS });
  }
  console.error("document-ocr-api-internal", error instanceof Error ? error.name : typeof error);
  return Response.json({ error: "internal_error", code: null }, { status: 500, headers: HEADERS });
}

async function downloadPrivateDocument(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new OcrApiError("ocr_source_url_invalid", 503);
  }
  if (url.protocol !== "https:" || url.hostname !== SUPABASE_STORAGE_HOST || !url.pathname.startsWith("/storage/v1/object/sign/")) {
    throw new OcrApiError("ocr_source_url_rejected", 503);
  }

  const response = await fetch(url, { cache: "no-store", redirect: "error" }).catch(() => null);
  if (!response?.ok) throw new OcrApiError("ocr_source_download_failed", 503);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new OcrApiError("ocr_source_too_large", 413);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new OcrApiError("ocr_source_too_large", 413);
  return bytes;
}

function providerForMime(mimeType: string): DocumentOcrProvider {
  if (IMAGE_MIMES.has(mimeType)) return imageProvider;
  if (mimeType === "application/pdf") return pdfProvider;
  throw new OcrApiError("unsupported_ocr_mime_type", 415);
}

function driveDownloader() {
  if (!googleDriveDownloader) {
    const credentials = getGoogleServiceAccountCredentialsFromEnvironment();
    const accessTokens = new GoogleServiceAccountAccessTokenProvider(
      credentials,
      fetch,
      Date.now,
      GOOGLE_DOCUMENT_READONLY_SCOPES,
    );
    googleDriveDownloader = new GoogleDriveDocumentDownloader(accessTokens);
  }
  return googleDriveDownloader;
}

async function documentBytes(detail: DocumentDetail) {
  if (detail.document.storageProvider === "google_drive") {
    const fileId = detail.document.sourceDriveFileId?.trim();
    if (!fileId) throw new OcrApiError("ocr_google_drive_file_id_missing", 409);
    const downloaded = await driveDownloader().download({
      fileId,
      expectedMimeType: detail.document.mimeType.toLowerCase(),
    });
    return downloaded.bytes;
  }

  const opened = await callPersistenceGateway<DocumentOpen>("document.open", { id: detail.document.id });
  return downloadPrivateDocument(opened.url);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !UUID.test(id)) throw new OcrApiError("invalid_ocr_document_id", 400);
    if ([...searchParams.keys()].some((key) => key !== "id")) throw new OcrApiError("invalid_ocr_query", 400);

    const detail = await callPersistenceGateway<DocumentDetail>("document.detail", { id });
    const mimeType = detail.document.mimeType.toLowerCase();
    const provider = providerForMime(mimeType);
    const bytes = await documentBytes(detail);
    const result = await runDocumentOcr({
      documentId: id,
      bytes,
      mimeType,
      originalFileName: detail.document.originalFileName,
      provider,
    });

    return Response.json(result, { headers: HEADERS });
  } catch (error) {
    return apiError(error);
  }
}
