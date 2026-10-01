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
import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const SUPABASE_STORAGE_HOST = "btzukbfesxdratqnxuoj.supabase.co";
const MIMES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const BASE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
};

let googleDriveDownloader: GoogleDriveDocumentDownloader | null = null;

type DocumentDetail = {
  document: {
    id: string;
    originalFileName: string;
    mimeType: string;
    storageProvider: "supabase" | "google_drive";
    sourceDriveFileId: string | null;
  };
};

type DocumentOpen = { url: string };

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

function safeDownloadName(value: string) {
  const clean = value.replace(/[\r\n"\\/]/g, "_").trim().slice(0, 240);
  return clean || "documento";
}

function attachmentHeaders(fileName: string, mimeType: string) {
  const safeName = safeDownloadName(fileName);
  return {
    ...BASE_HEADERS,
    "content-type": mimeType,
    "content-disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  };
}

function fail(code: string, status: number) {
  return Response.json({ error: "document_download_failed", code }, { status, headers: BASE_HEADERS });
}

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return fail(error.code ?? (error.status === 404 ? "document_not_found" : "persistence_failed"), error.status >= 400 && error.status < 600 ? error.status : 503);
  }
  if (error instanceof GoogleDriveDocumentError) {
    const statuses: Record<GoogleDriveDocumentError["code"], number> = {
      google_drive_document_id_invalid: 409,
      google_drive_document_access_denied: 409,
      google_drive_document_not_found: 404,
      google_drive_document_metadata_invalid: 409,
      google_drive_document_mime_mismatch: 415,
      google_drive_document_content_mismatch: 415,
      google_drive_document_too_large: 413,
      google_drive_document_download_failed: 503,
    };
    return fail(error.code, statuses[error.code]);
  }
  if (error instanceof GoogleServiceAccountError) return fail(error.code, 503);
  if (error instanceof Error) {
    const statuses: Record<string, number> = {
      invalid_document_id: 400,
      invalid_document_download_query: 400,
      unsupported_document_mime_type: 415,
      document_drive_file_unavailable: 409,
      document_download_url_invalid: 503,
      document_download_source_rejected: 503,
      document_download_failed: 503,
      document_download_too_large: 413,
    };
    if (statuses[error.message]) return fail(error.message, statuses[error.message]);
  }
  console.error("document-download-internal", error instanceof Error ? error.name : typeof error);
  return fail("internal_error", 500);
}

async function downloadSupabaseOriginal(id: string, detail: DocumentDetail) {
  const opened = await callPersistenceGateway<DocumentOpen>("document.open", { id });
  let url: URL;
  try {
    url = new URL(opened.url);
  } catch {
    throw new Error("document_download_url_invalid");
  }
  if (
    url.protocol !== "https:"
    || url.hostname !== SUPABASE_STORAGE_HOST
    || !url.pathname.startsWith("/storage/v1/object/sign/")
  ) {
    throw new Error("document_download_source_rejected");
  }

  const response = await fetch(url, { cache: "no-store", redirect: "error" }).catch(() => null);
  if (!response?.ok) throw new Error("document_download_failed");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) throw new Error("document_download_too_large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) throw new Error("document_download_too_large");

  return new Response(bytes, {
    status: 200,
    headers: attachmentHeaders(detail.document.originalFileName, detail.document.mimeType),
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !UUID.test(id)) throw new Error("invalid_document_id");
    if ([...searchParams.keys()].some((key) => key !== "id")) throw new Error("invalid_document_download_query");

    const detail = await callPersistenceGateway<DocumentDetail>("document.detail", { id });
    const mimeType = detail.document.mimeType.toLowerCase();
    if (!MIMES.has(mimeType)) throw new Error("unsupported_document_mime_type");

    if (detail.document.storageProvider === "google_drive") {
      const fileId = detail.document.sourceDriveFileId?.trim();
      if (!fileId) throw new Error("document_drive_file_unavailable");
      const downloaded = await driveDownloader().download({ fileId, expectedMimeType: mimeType });
      if (!downloaded.bytes.byteLength || downloaded.bytes.byteLength > MAX_FILE_BYTES) throw new Error("document_download_too_large");
      return new Response(downloaded.bytes, {
        status: 200,
        headers: attachmentHeaders(downloaded.fileName ?? detail.document.originalFileName, downloaded.mimeType),
      });
    }

    return await downloadSupabaseOriginal(id, detail);
  } catch (error) {
    return apiError(error);
  }
}
