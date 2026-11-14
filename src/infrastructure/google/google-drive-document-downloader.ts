import { documentBytesMatchMimeType } from "../../domain/document-content-signature";
import { LimitedResponseBodyError, readLimitedResponseBody } from "../http/limited-response-body";
import type { GoogleAccessTokenProvider } from "./official-bank-source-reader";

export const GOOGLE_DRIVE_OCR_MAX_BYTES = 15 * 1024 * 1024;

const DRIVE_FETCH_TIMEOUT_MS = 45_000;

const FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const MAX_AUTHORIZED_ROOTS = 12;
const MAX_AUTHORIZED_FOLDER_DEPTH = 6;
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type DriveMetadata = {
  id?: unknown;
  name?: unknown;
  mimeType?: unknown;
  size?: unknown;
  trashed?: unknown;
  modifiedTime?: unknown;
  version?: unknown;
  parents?: unknown;
};

export class GoogleDriveDocumentError extends Error {
  constructor(
    public readonly code:
      | "google_drive_document_id_invalid"
      | "google_drive_document_access_denied"
      | "google_drive_document_not_found"
      | "google_drive_document_metadata_invalid"
      | "google_drive_document_source_changed"
      | "google_drive_document_mime_mismatch"
      | "google_drive_document_content_mismatch"
      | "google_drive_document_too_large"
      | "google_drive_document_download_failed",
    message: string,
  ) {
    super(message);
    this.name = "GoogleDriveDocumentError";
  }
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseSize(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}


/** Only authoritative RFC 3339 timestamps returned by Google Drive may be persisted. */
function driveModifiedTime(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) {
    throw new GoogleDriveDocumentError(
      "google_drive_document_metadata_invalid",
      "Google Drive no ha devuelto una fecha de modificación válida.",
    );
  }
  return value;
}

async function readDriveMediaBounded(response: Response): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return await readLimitedResponseBody(response, GOOGLE_DRIVE_OCR_MAX_BYTES);
  } catch (error) {
    if (error instanceof LimitedResponseBodyError && error.reason === "too_large") {
      throw new GoogleDriveDocumentError(
        "google_drive_document_too_large",
        "La descarga de Drive supera el límite seguro de 15 MB.",
      );
    }
    throw new GoogleDriveDocumentError(
      "google_drive_document_download_failed",
      "No se pudo completar la descarga del documento de Drive.",
    );
  }
}

/** Drive returns version as an int64 decimal string; never round it to Number. */
function driveVersion(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^[0-9]{1,20}$/.test(value)) {
    throw new GoogleDriveDocumentError(
      "google_drive_document_metadata_invalid",
      "La versión del archivo original no es válida.",
    );
  }
  return value.replace(/^0+(?=\d)/, "");
}

function googleHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
  };
}

function mapGoogleFailure(status: number) {
  if (status === 401 || status === 403) {
    return new GoogleDriveDocumentError(
      "google_drive_document_access_denied",
      "Financial App Reader no tiene permiso de lectura sobre este archivo de Drive.",
    );
  }
  if (status === 404) {
    return new GoogleDriveDocumentError(
      "google_drive_document_not_found",
      "El archivo de Drive ya no existe o no es visible para Financial App Reader.",
    );
  }
  return new GoogleDriveDocumentError(
    "google_drive_document_download_failed",
    `Google Drive ha rechazado la lectura con estado ${status}.`,
  );
}

export class GoogleDriveDocumentDownloader {
  constructor(
    private readonly accessTokens: GoogleAccessTokenProvider,
    private readonly fetcher: typeof fetch = fetch,
  ) {}


  /**
   * Resolve a Drive file's real parent chain to one of the server-configured
   * authorized roots. A child folder's placement is mutable, so call this
   * BEFORE and AFTER the media read and require the same chain both times.
   * Only trusted Drive metadata and server-side root IDs are accepted.
   */
  private async verifiedAuthorizedFolderChain(
    rawParents: unknown,
    roots: ReadonlySet<string>,
    accessToken: string,
    mismatchCode: "google_drive_document_access_denied" | "google_drive_document_source_changed",
  ): Promise<string> {
    const mismatch = () => new GoogleDriveDocumentError(
      mismatchCode,
      "El documento no conserva una ruta íntegra a una carpeta Drive autorizada.",
    );
    if (!Array.isArray(rawParents) || rawParents.length !== 1
      || typeof rawParents[0] !== "string" || !FILE_ID.test(rawParents[0])) {
      throw mismatch();
    }
    const chain: string[] = [];
    let folderId: string = rawParents[0];
    for (let depth = 0; depth <= MAX_AUTHORIZED_FOLDER_DEPTH; depth++) {
      if (chain.includes(folderId)) throw mismatch();
      chain.push(folderId);
      if (roots.has(folderId)) return chain.join("/");
      if (depth === MAX_AUTHORIZED_FOLDER_DEPTH) break;
      const folderUrl =
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}` +
        "?fields=id,mimeType,trashed,parents&supportsAllDrives=true";
      const response = await this.fetcher(folderUrl, {
        method: "GET",
        headers: googleHeaders(accessToken),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(DRIVE_FETCH_TIMEOUT_MS),
      }).catch(() => null);
      if (!response) {
        throw new GoogleDriveDocumentError(
          "google_drive_document_download_failed",
          "No se pudo comprobar la pertenencia de una carpeta a la raíz autorizada.",
        );
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          throw mismatch();
        }
        throw new GoogleDriveDocumentError(
          "google_drive_document_download_failed",
          "Google Drive no ha permitido verificar la carpeta del documento.",
        );
      }
      const folder = (await response.json().catch(() => null)) as DriveMetadata | null;
      if (!folder || asNonEmptyString(folder.id) !== folderId
        || folder.mimeType !== "application/vnd.google-apps.folder" || folder.trashed === true
        || !Array.isArray(folder.parents) || folder.parents.length !== 1
        || typeof folder.parents[0] !== "string" || !FILE_ID.test(folder.parents[0])) {
        throw mismatch();
      }
      folderId = folder.parents[0];
    }
    throw mismatch();
  }

  async download(input: {
    fileId: string;
    expectedMimeType: string;
    expectedModifiedTime?: string;
    expectedSizeBytes?: number;
    expectedAuthorizedFolderId?: string;
    /** Server-configured roots only. Allows verified descendants as well as direct children. */
    expectedAuthorizedRootFolderIds?: readonly string[];
  }) {
    const fileId = input.fileId.trim();
    const expectedMimeType = input.expectedMimeType.trim().toLowerCase();
    const authorizedFolder = input.expectedAuthorizedFolderId?.trim() ?? null;
    const rootIds = input.expectedAuthorizedRootFolderIds;
    if (rootIds !== undefined && (!Array.isArray(rootIds) || rootIds.length < 1
      || rootIds.length > MAX_AUTHORIZED_ROOTS || rootIds.some((id) => typeof id !== "string" || !FILE_ID.test(id))
      || new Set(rootIds).size !== rootIds.length)) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_id_invalid",
        "El conjunto de carpetas Drive autorizadas no es válido.",
      );
    }
    const roots = rootIds === undefined ? null : new Set(rootIds);
    if (authorizedFolder !== null && !FILE_ID.test(authorizedFolder)) {
      throw new GoogleDriveDocumentError("google_drive_document_id_invalid", "La carpeta Drive autorizada no es válida.");
    }
    if (!FILE_ID.test(fileId)) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_id_invalid",
        "El identificador persistido del archivo de Drive no es válido.",
      );
    }
    if (!ALLOWED_MIMES.has(expectedMimeType)) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_mime_mismatch",
        "El tipo del documento no admite OCR desde Drive.",
      );
    }

    const accessToken = (await this.accessTokens.getAccessToken()).trim();
    if (!accessToken) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_access_denied",
        "No hay un token de lectura válido para Financial App Reader.",
      );
    }

    const encodedId = encodeURIComponent(fileId);
    const metadataUrl =
      `https://www.googleapis.com/drive/v3/files/${encodedId}` +
      "?fields=id,name,mimeType,size,modifiedTime,version,trashed,parents&supportsAllDrives=true";
    const metadataResponse = await this.fetcher(metadataUrl, {
      method: "GET",
      headers: googleHeaders(accessToken),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(DRIVE_FETCH_TIMEOUT_MS),
    }).catch(() => null);
    if (!metadataResponse) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_download_failed",
        "No se ha podido consultar el archivo de Drive.",
      );
    }
    if (!metadataResponse.ok) throw mapGoogleFailure(metadataResponse.status);

    const metadata = (await metadataResponse.json().catch(() => null)) as DriveMetadata | null;
    const returnedId = asNonEmptyString(metadata?.id);
    const mimeType = asNonEmptyString(metadata?.mimeType)?.toLowerCase() ?? null;
    const size = parseSize(metadata?.size);
    if (returnedId !== fileId || !mimeType || size === null || metadata?.trashed === true) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_metadata_invalid",
        "Google Drive no ha devuelto metadatos íntegros del archivo original.",
      );
    }
    // A service-account grant on another folder does not authorize importing
    // a browser-supplied file ID. Reject BEFORE any media bytes are fetched.
    if (authorizedFolder !== null && (!Array.isArray(metadata?.parents)
      || !metadata.parents.includes(authorizedFolder))) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_access_denied",
        "Este archivo no pertenece a la carpeta documental autorizada.",
      );
    }
    const initialAuthorizedChain = roots === null ? null
      : await this.verifiedAuthorizedFolderChain(
        metadata?.parents, roots, accessToken, "google_drive_document_access_denied",
      );
    if (mimeType !== expectedMimeType || !ALLOWED_MIMES.has(mimeType)) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_mime_mismatch",
        "El tipo real del archivo de Drive no coincide con el documento registrado.",
      );
    }
    const modifiedTime = driveModifiedTime(metadata?.modifiedTime);
    const version = driveVersion(metadata?.version);
    // Folder discovery and download may race: never mix two distinct Drive
    // revisions in an incremental import. Optional expectations come only
    // from server-side discovery, not from a browser-provided assertion.
    if ((input.expectedModifiedTime !== undefined
        && (!modifiedTime || Date.parse(modifiedTime) !== Date.parse(input.expectedModifiedTime)))
      || (input.expectedSizeBytes !== undefined && size !== input.expectedSizeBytes)) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_source_changed",
        "El original de Drive cambió durante la comprobación; repite la sincronización.",
      );
    }
    if (size <= 0 || size > GOOGLE_DRIVE_OCR_MAX_BYTES) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_too_large",
        "El archivo de Drive está vacío o supera el límite seguro de 15 MB.",
      );
    }

    const mediaUrl =
      `https://www.googleapis.com/drive/v3/files/${encodedId}` +
      "?alt=media&supportsAllDrives=true";
    const mediaResponse = await this.fetcher(mediaUrl, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(DRIVE_FETCH_TIMEOUT_MS),
    }).catch(() => null);
    if (!mediaResponse) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_download_failed",
        "No se ha podido descargar el archivo original de Drive.",
      );
    }
    if (!mediaResponse.ok) throw mapGoogleFailure(mediaResponse.status);

    const rawContentLength = mediaResponse.headers.get("content-length");
    if (rawContentLength !== null) {
      const declared = parseSize(rawContentLength);
      if (declared === null || declared <= 0 || declared > GOOGLE_DRIVE_OCR_MAX_BYTES) {
        throw new GoogleDriveDocumentError(
          "google_drive_document_too_large",
          "La descarga de Drive supera el límite seguro de 15 MB.",
        );
      }
    }

    const bytes = await readDriveMediaBounded(mediaResponse);
    if (!bytes.byteLength || bytes.byteLength > GOOGLE_DRIVE_OCR_MAX_BYTES || bytes.byteLength !== size) {
      throw new GoogleDriveDocumentError(
        bytes.byteLength > GOOGLE_DRIVE_OCR_MAX_BYTES
          ? "google_drive_document_too_large"
          : "google_drive_document_download_failed",
        "La descarga de Drive no coincide con el tamaño validado del archivo original.",
      );
    }
    if (!documentBytesMatchMimeType(bytes, mimeType)) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_content_mismatch",
        "El contenido real del archivo de Drive no coincide con el tipo documental declarado.",
      );
    }

    // Drive's version is monotonically increasing for ALL server-side
    // changes. Repeat the read-only metadata query after downloading bytes;
    // if either revision differs, do not persist this mixed snapshot.
    const finalMetadataResponse = await this.fetcher(metadataUrl, {
      method: "GET",
      headers: googleHeaders(accessToken),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(DRIVE_FETCH_TIMEOUT_MS),
    }).catch(() => null);
    if (!finalMetadataResponse) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_download_failed",
        "No se pudo volver a verificar la versión del archivo original.",
      );
    }
    if (!finalMetadataResponse.ok) throw mapGoogleFailure(finalMetadataResponse.status);
    const finalMetadata = (await finalMetadataResponse.json().catch(() => null)) as DriveMetadata | null;
    const finalName = asNonEmptyString(finalMetadata?.name);
    const firstName = asNonEmptyString(metadata?.name);
    const finalSize = parseSize(finalMetadata?.size);
    const finalMime = asNonEmptyString(finalMetadata?.mimeType)?.toLowerCase() ?? null;
    const finalModified = driveModifiedTime(finalMetadata?.modifiedTime);
    const finalVersion = driveVersion(finalMetadata?.version);
    // A folder move between the pre/post media metadata checks invalidates
    // the snapshot: never persist bytes from an external Drive directory.
    if (authorizedFolder !== null && (!Array.isArray(finalMetadata?.parents)
      || !finalMetadata.parents.includes(authorizedFolder))) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_source_changed",
        "El documento salió de la carpeta autorizada durante la descarga.",
      );
    }
    const finalAuthorizedChain = roots === null ? null
      : await this.verifiedAuthorizedFolderChain(
        finalMetadata?.parents, roots, accessToken, "google_drive_document_source_changed",
      );
    if (initialAuthorizedChain !== finalAuthorizedChain) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_source_changed",
        "Una carpeta del documento cambió de ubicación durante la descarga.",
      );
    }
    if (asNonEmptyString(finalMetadata?.id) !== fileId || finalMetadata?.trashed === true
      || finalSize !== size || finalMime !== mimeType || finalName !== firstName
      || finalModified !== modifiedTime || finalVersion !== version) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_source_changed",
        "El original de Drive cambió durante la descarga; repite la operación.",
      );
    }

    return {
      bytes,
      fileId,
      fileName: asNonEmptyString(metadata?.name),
      mimeType,
      sizeBytes: size,
      modifiedTime,
    };
  }
}
