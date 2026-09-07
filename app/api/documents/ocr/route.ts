import { runDocumentOcr, type DocumentOcrProvider } from "../../../../src/application/document-ocr-service";
import { PdfTextOcrProvider } from "../../../../src/infrastructure/ocr/pdf-text-provider";
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

const imageProvider = new TesseractImageOcrProvider();
const pdfProvider = new PdfTextOcrProvider();

type DocumentDetail = {
  document: {
    id: string;
    mimeType: string;
    originalFileName: string;
    storageProvider: "supabase" | "google_drive";
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !UUID.test(id)) throw new OcrApiError("invalid_ocr_document_id", 400);
    if ([...searchParams.keys()].some((key) => key !== "id")) throw new OcrApiError("invalid_ocr_query", 400);

    const detail = await callPersistenceGateway<DocumentDetail>("document.detail", { id });
    if (detail.document.storageProvider !== "supabase") {
      throw new OcrApiError("ocr_google_drive_download_not_enabled", 409);
    }
    const mimeType = detail.document.mimeType.toLowerCase();
    const provider = providerForMime(mimeType);

    const opened = await callPersistenceGateway<DocumentOpen>("document.open", { id });
    const bytes = await downloadPrivateDocument(opened.url);
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
