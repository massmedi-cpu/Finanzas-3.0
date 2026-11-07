import type { GoogleAccessTokenProvider } from "./official-bank-source-reader";

export const FINANCIAL_APP_DOCUMENTS_DRIVE_FOLDER_ID = "1UCUZSmOWfGM5VyvhDcx7ExeBw3LS872t";
export const GOOGLE_DRIVE_DOCUMENT_DISCOVERY_MAX_FILES = 2000;
export const GOOGLE_DRIVE_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

const GOOGLE_DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;
// This upper bound is an error, NOT proof that the folder was exhausted.
const MAX_DISCOVERY_PAGES = 200;
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
  readonly code:
    | "google_drive_document_discovery_access_denied"
    | "google_drive_document_discovery_failed"
    | "google_drive_document_discovery_response_invalid";

  constructor(code: GoogleDriveDocumentDiscoveryError["code"], message: string) {
    super(message);
    this.code = code;
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
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(result)) return null;
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
  if (!fileId || !DRIVE_FILE_ID.test(fileId) || !name || sizeBytes === null || !modifiedTime) return null;
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
  private readonly accessTokens: GoogleAccessTokenProvider;
  private readonly fetcher: typeof fetch;

  constructor(accessTokens: GoogleAccessTokenProvider, fetcher: typeof fetch = fetch) {
    this.accessTokens = accessTokens;
    this.fetcher = fetcher;
  }

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
    const seenPageTokens = new Set<string>();
    const seenFileIds = new Set<string>();
    let pagesRead = 0;

    do {
      // Never accept a repeated cursor, a silent pagination loop or excessive
      // empty/unsupported pages as evidence of a complete Drive inventory.
      if (++pagesRead > MAX_DISCOVERY_PAGES || (pageToken !== null && seenPageTokens.has(pageToken))) {
        throw new GoogleDriveDocumentDiscoveryError(
          "google_drive_document_discovery_response_invalid",
          "Google Drive no ha permitido completar la paginación documental con seguridad.",
        );
      }
      if (pageToken !== null) seenPageTokens.add(pageToken);
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
      if (!payload || Array.isArray(payload) || !Array.isArray(payload.files)
        || (payload.nextPageToken !== undefined && payload.nextPageToken !== null
          && (typeof payload.nextPageToken !== "string" || !payload.nextPageToken.trim()))) {
        throw new GoogleDriveDocumentDiscoveryError(
          "google_drive_document_discovery_response_invalid",
          "Google Drive no ha devuelto una lista documental válida.",
        );
      }

      for (const raw of payload.files) {
        const mapped = mapFile(raw);
        if (mapped === "unsupported") {
          skippedUnsupported += 1;
          continue;
        }
        if (!mapped) {
          skippedInvalid += 1;
          continue;
        }
        if (seenFileIds.has(mapped.fileId)) {
          throw new GoogleDriveDocumentDiscoveryError(
            "google_drive_document_discovery_response_invalid",
            "Google Drive ha repetido un documento entre páginas. La importación se ha detenido.",
          );
        }
        seenFileIds.add(mapped.fileId);
        if (files.length >= GOOGLE_DRIVE_DOCUMENT_DISCOVERY_MAX_FILES) {
          truncated = true;
          break;
        }
        files.push(mapped);
      }

      if (truncated) break;
      pageToken = stringValue(payload.nextPageToken);
      if (pageToken !== null && seenPageTokens.has(pageToken)) {
        throw new GoogleDriveDocumentDiscoveryError(
          "google_drive_document_discovery_response_invalid",
          "Google Drive ha devuelto un cursor de paginación repetido.",
        );
      }
    } while (pageToken);

    return { files, skippedUnsupported, skippedInvalid, truncated };
  }

  /**
   * Enumerate immediate child folders of a verified parent. Never search all of
   * Drive: every request is limited by an exact parent ID. The caller manages
   * depth and cumulative folder limits across all authorized roots.
   */
  async listAuthorizedChildFolders(folderId: string): Promise<string[]> {
    const id = folderId.trim();
    if (!DRIVE_FILE_ID.test(id)) {
      throw new GoogleDriveDocumentDiscoveryError(
        "google_drive_document_discovery_response_invalid",
        "La carpeta de documentos contiene un identificador inválido.",
      );
    }
    const accessToken = (await this.accessTokens.getAccessToken()).trim();
    if (!accessToken) {
      throw new GoogleDriveDocumentDiscoveryError(
        "google_drive_document_discovery_access_denied",
        "No existe permiso de lectura válido para consultar las subcarpetas.",
      );
    }
    const children: string[] = [];
    const seenIds = new Set<string>();
    const seenCursors = new Set<string>();
    let pageToken: string | null = null;
    let pagesRead = 0;
    do {
      if (++pagesRead > MAX_DISCOVERY_PAGES || (pageToken && seenCursors.has(pageToken))) {
        throw new GoogleDriveDocumentDiscoveryError(
          "google_drive_document_discovery_response_invalid",
          "La enumeración de subcarpetas excede el límite o repite un cursor.",
        );
      }
      if (pageToken) seenCursors.add(pageToken);
      const params = new URLSearchParams({
        q: `'${id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "nextPageToken,files(id,mimeType,trashed)",
        pageSize: "1000",
        orderBy: "name asc",
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
      if (!response || !response.ok) {
        throw new GoogleDriveDocumentDiscoveryError(
          response?.status === 401 || response?.status === 403
            ? "google_drive_document_discovery_access_denied"
            : "google_drive_document_discovery_failed",
          "No ha sido posible enumerar por completo las subcarpetas autorizadas.",
        );
      }
      const payload = (await response.json().catch(() => null)) as DriveListPayload | null;
      if (!payload || Array.isArray(payload) || !Array.isArray(payload.files)
        || (payload.nextPageToken !== undefined && payload.nextPageToken !== null
          && (typeof payload.nextPageToken !== "string" || !payload.nextPageToken.trim()))) {
        throw new GoogleDriveDocumentDiscoveryError(
          "google_drive_document_discovery_response_invalid",
          "La enumeración de subcarpetas ha devuelto un resultado inválido.",
        );
      }
      for (const raw of payload.files) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          throw new GoogleDriveDocumentDiscoveryError(
            "google_drive_document_discovery_response_invalid",
            "La enumeración de subcarpetas contiene una entrada inválida.",
          );
        }
        const item = raw as DriveFilePayload;
        const childId = stringValue(item.id);
        if (!childId || !DRIVE_FILE_ID.test(childId) || item.trashed === true
          || item.mimeType !== "application/vnd.google-apps.folder" || seenIds.has(childId)
          || children.length >= 100) {
          throw new GoogleDriveDocumentDiscoveryError(
            "google_drive_document_discovery_response_invalid",
            "Hay una subcarpeta inválida, repetida o demasiadas subcarpetas.",
          );
        }
        children.push(childId);
        seenIds.add(childId);
      }
      pageToken = stringValue(payload.nextPageToken);
      if (pageToken && seenCursors.has(pageToken)) {
        throw new GoogleDriveDocumentDiscoveryError(
          "google_drive_document_discovery_response_invalid",
          "Google Drive ha repetido un cursor de subcarpetas.",
        );
      }
    } while (pageToken);
    return children;
  }

}
