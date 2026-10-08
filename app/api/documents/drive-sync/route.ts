import {
  FINANCIAL_APP_DOCUMENTS_DRIVE_FOLDER_ID,
  GoogleDriveDocumentDiscovery,
  GoogleDriveDocumentDiscoveryError,
  type DiscoveredDriveDocument,
} from "../../../../src/infrastructure/google/google-drive-document-discovery";
import {
  GoogleDriveDocumentDownloader,
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

const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const PAGE_SIZE = 100;
const MAX_IMPORTS_PER_RUN = 200;
const DOWNLOAD_CONCURRENCY = 4;

type ExistingDocument = {
  sourceDriveFileId: string | null;
  sourceModifiedAt: string | null;
  mimeType: string;
  sizeBytes: number | null;
};

type DocumentList = {
  items: ExistingDocument[];
  total: number;
};

type SyncCandidate = DiscoveredDriveDocument & {
  type: "ticket" | "invoice" | "other";
};

let discovery: GoogleDriveDocumentDiscovery | null = null;
let downloader: GoogleDriveDocumentDownloader | null = null;

function googleReaders() {
  if (!discovery || !downloader) {
    const credentials = getGoogleServiceAccountCredentialsFromEnvironment();
    const accessTokens = new GoogleServiceAccountAccessTokenProvider(
      credentials,
      fetch,
      Date.now,
      GOOGLE_DOCUMENT_READONLY_SCOPES,
    );
    discovery = new GoogleDriveDocumentDiscovery(accessTokens);
    downloader = new GoogleDriveDocumentDownloader(accessTokens);
  }
  return { discovery, downloader };
}

function inferDocumentType(name: string): SyncCandidate["type"] {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\b(factura|invoice)\b/.test(normalized)) return "invoice";
  if (/\b(ticket|tique|recibo)\b/.test(normalized)) return "ticket";
  return "other";
}

function timestamp(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function changed(file: DiscoveredDriveDocument, previous: ExistingDocument | undefined) {
  if (!previous) return true;
  return (
    previous.mimeType.toLowerCase() !== file.mimeType ||
    previous.sizeBytes !== file.sizeBytes ||
    timestamp(previous.sourceModifiedAt) !== timestamp(file.modifiedTime)
  );
}

async function existingDriveDocuments() {
  const result = new Map<string, ExistingDocument>();
  let offset = 0;
  let total = 0;

  do {
    const page = await callPersistenceGateway<DocumentList>("document.list", {
      status: null,
      query: null,
      limit: PAGE_SIZE,
      offset,
      scope: "all",
    });
    total = page.total;
    for (const item of page.items) {
      if (item.sourceDriveFileId) result.set(item.sourceDriveFileId, item);
    }
    offset += page.items.length;
    if (page.items.length === 0) break;
  } while (offset < total);

  return result;
}

async function verifyCandidates(
  candidates: SyncCandidate[],
  driveDownloader: GoogleDriveDocumentDownloader,
) {
  const verified: SyncCandidate[] = [];
  let failed = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const position = cursor;
      cursor += 1;
      const candidate = candidates[position];
      if (!candidate) return;
      try {
        const downloaded = await driveDownloader.download({
          fileId: candidate.fileId,
          expectedMimeType: candidate.mimeType,
        });
        verified.push({
          ...candidate,
          name: downloaded.fileName ?? candidate.name,
          mimeType: downloaded.mimeType,
          sizeBytes: downloaded.sizeBytes,
        });
      } catch {
        failed += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, candidates.length) }, () => worker()),
  );
  return { verified, failed };
}

function apiError(error: unknown) {
  if (error instanceof GoogleDriveDocumentDiscoveryError) {
    const status = error.code === "google_drive_document_discovery_access_denied" ? 409 : 503;
    return Response.json(
      { error: "drive_auto_detection_unavailable", code: error.code },
      { status, headers: HEADERS },
    );
  }
  if (error instanceof GoogleServiceAccountError) {
    return Response.json(
      { error: "drive_auto_detection_unavailable", code: error.code },
      { status: 503, headers: HEADERS },
    );
  }
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "drive_auto_detection_persistence_failed", code: error.code ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 503, headers: HEADERS },
    );
  }
  console.error("document-drive-auto-sync", error instanceof Error ? error.name : typeof error);
  return Response.json(
    { error: "drive_auto_detection_failed", code: null },
    { status: 500, headers: HEADERS },
  );
}

export async function POST() {
  try {
    const readers = googleReaders();
    const existingPromise = existingDriveDocuments();
    const discoveredPromise = readers.discovery.listAuthorizedFolder(
      FINANCIAL_APP_DOCUMENTS_DRIVE_FOLDER_ID,
    );
    const [existing, discovered] = await Promise.all([existingPromise, discoveredPromise]);

    const changedFiles = discovered.files
      .filter((file) => changed(file, existing.get(file.fileId)))
      .map((file) => ({ ...file, type: inferDocumentType(file.name) }));
    const candidates = changedFiles.slice(0, MAX_IMPORTS_PER_RUN);
    const pending = Math.max(0, changedFiles.length - candidates.length);
    const { verified, failed } = await verifyCandidates(candidates, readers.downloader);

    let imported = 0;
    if (verified.length > 0) {
      const result = await callPersistenceGateway<{ imported: number }>("document.drive_batch", {
        files: verified.map((file) => ({
          type: file.type,
          name: file.name,
          mimeType: file.mimeType,
          fileId: file.fileId,
          sizeBytes: file.sizeBytes,
          modifiedTime: file.modifiedTime,
        })),
      });
      imported = result.imported;
    }

    return Response.json(
      {
        contractVersion: 1,
        source: "google_drive",
        mode: "automatic_incremental_read_only",
        folderId: FINANCIAL_APP_DOCUMENTS_DRIVE_FOLDER_ID,
        scanned: discovered.files.length,
        detectedChanges: changedFiles.length,
        imported,
        unchanged: discovered.files.length - changedFiles.length,
        failed,
        pending,
        skippedUnsupported: discovered.skippedUnsupported,
        skippedInvalid: discovered.skippedInvalid,
        truncated: discovered.truncated,
        completedAt: new Date().toISOString(),
        principles: {
          bankSource: "read_only",
          driveSource: "read_only",
          duplicateSafe: true,
          nonBlocking: true,
        },
      },
      { headers: HEADERS },
    );
  } catch (error) {
    return apiError(error);
  }
}
