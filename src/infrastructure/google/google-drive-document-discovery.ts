import type { GoogleAccessTokenProvider } from "./official-bank-source-reader";

export const FINANCIAL_APP_DOCUMENTS_DRIVE_FOLDER_ID = "1UCUZSmOWfGM5VyvhDcx7ExeBw3LS872t";
export const GOOGLE_DRIVE_DOCUMENT_DISCOVERY_MAX_FILES = 2000;
export const GOOGLE_DRIVE_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

const GOOGLE_DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type DriveFilePayload = {
  id?: unknown;
  name?: unknown;
  mimeType?: unknown;
  size?: unknown;
  modifiedTime?: unknown;
  trashed?: unknown;
};

type DriveListPayload = {
  nextPageToken?: unknown;
  files?: unknown;
};

export type DiscoveredDriveDocument = {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  modifiedTime: string;
};

export type GoogleDriveDocumentDiscoveryResult = {
  files: DiscoveredDriveDocument[];
  skippedUnsupported: number;
  skippedInvalid: number;
  truncated: boolean;
};

export class GoogleDriveDocumentDiscoveryError extends Error {
  constructor(
    public readonly code:
      | "google_drive_document_discovery_access_denied"
      | "google_drive_document_discovery_failed"
      | "google_drive_document_discovery_response_invalid",
    message: string,
  ) {
    super(message);
    this.name = "GoogleDriveDocumentDiscoveryError";
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sizeValue(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function validModifiedTime(value: unknown) {
  const result = stringValue(value);
  if (!result) return null;
  const parsed = Date.parse(result);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function mapFile(value: unknown): DiscoveredDriveDocument | "unsupported" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as DriveFilePayload;
  if (item.trashed === true) return null;

  const fileId = stringValue(item.id);
  const name = stringValue(item.name);
  const mimeType = stringValue(item.mimeType)?.toLowerCase() ?? null;
  const sizeBytes = sizeValue(item.size);
  const modifiedTime = validModifiedTime(item.modifiedTime);

  if (!mimeType || !ALLOWED_MIMES.has(mimeType)) return "unsupported";
  if (!fileId || !name || sizeBytes === null || !modifiedTime) return null;
  if (sizeBytes <= 0 || sizeBytes > GOOGLE_DRIVE_DOCUMENT_MAX_BYTES) return null;

  return { fileId, name, mimeType, sizeBytes, modifiedTime };
}

function discoveryHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
  };
}

export class GoogleDriveDocumentDiscovery {
  constructor(
    private readonly accessTokens: GoogleAccessTokenProvider,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async listAuthorizedFolder(
    folderId = FINANCIAL_APP_DOCUMENTS_DRIVE_FOLDER_ID,
  ): Promise<GoogleDriveDocumentDiscoveryResult> {
    const normalizedFolderId = folderId.trim();
    if (!normalizedFolderId) {
      throw new GoogleDriveDocumentDiscoveryError(
        "google_drive_document_discovery_response_invalid",
        "La carpeta autorizada de documentos no está configurada.",
      );
    }

    const accessToken = (await this.accessTokens.getAccessToken()).trim();
    if (!accessToken) {
      throw new GoogleDriveDocumentDiscoveryError(
        "google_drive_document_discovery_access_denied",
        "No existe un token de lectura válido para consultar la carpeta de documentos.",
      );
    }

    const files: DiscoveredDriveDocument[] = [];
    let pageToken: string | null = null;
    let skippedUnsupported = 0;
    let skippedInvalid = 0;
    let truncated = false;

    do {
      const params = new URLSearchParams({
        q: `'${normalizedFolderId.replaceAll("'", "\\'")}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,trashed)",
        pageSize: "1000",
        orderBy: "modifiedTime asc,name asc",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const response = await this.fetcher(`${GOOGLE_DRIVE_FILES_ENDPOINT}?${params.toString()}`, {
        method: "GET",
        headers: discoveryHeaders(accessToken),
        cache: "no-store",
        redirect: "error",
      }).catch(() => null);

      if (!response) {
        throw new GoogleDriveDocumentDiscoveryError(
          "google_drive_document_discovery_failed",
          "No se ha podido consultar la carpeta autorizada de Google Drive.",
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new GoogleDriveDocumentDiscoveryError(
          "google_drive_document_discovery_access_denied",
          "Financial App Reader no tiene permiso de lectura sobre la carpeta autorizada.",
        );
      }
      if (!response.ok) {
        throw new GoogleDriveDocumentDiscoveryError(
          "google_drive_document_discovery_failed",
          `Google Drive ha rechazado el descubrimiento documental con estado ${response.status}.`,
        );
      }

      const payload = (await response.json().catch(() => null)) as DriveListPayload | null;
      if (!payload || (payload.files !== undefined && !Array.isArray(payload.files))) {
        throw new GoogleDriveDocumentDiscoveryError(
          "google_drive_document_discovery_response_invalid",
          "Google Drive no ha devuelto una lista documental válida.",
        );
      }

      for (const raw of Array.isArray(payload.files) ? payload.files : []) {
        const mapped = mapFile(raw);
        if (mapped === "unsupported") {
          skippedUnsupported += 1;
          continue;
        }
        if (!mapped) {
          skippedInvalid += 1;
          continue;
        }
        if (files.length >= GOOGLE_DRIVE_DOCUMENT_DISCOVERY_MAX_FILES) {
          truncated = true;
          break;
        }
        files.push(mapped);
      }

      if (truncated) break;
      pageToken = stringValue(payload.nextPageToken);
    } while (pageToken);

    return { files, skippedUnsupported, skippedInvalid, truncated };
  }
}
