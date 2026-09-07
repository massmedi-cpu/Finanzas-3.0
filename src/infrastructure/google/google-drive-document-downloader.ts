import type { GoogleAccessTokenProvider } from "./official-bank-source-reader";

export const GOOGLE_DRIVE_OCR_MAX_BYTES = 15 * 1024 * 1024;

const FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;
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
};

export class GoogleDriveDocumentError extends Error {
  constructor(
    public readonly code:
      | "google_drive_document_id_invalid"
      | "google_drive_document_access_denied"
      | "google_drive_document_not_found"
      | "google_drive_document_metadata_invalid"
      | "google_drive_document_mime_mismatch"
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

  async download(input: { fileId: string; expectedMimeType: string }) {
    const fileId = input.fileId.trim();
    const expectedMimeType = input.expectedMimeType.trim().toLowerCase();
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
      "?fields=id,name,mimeType,size,trashed&supportsAllDrives=true";
    const metadataResponse = await this.fetcher(metadataUrl, {
      method: "GET",
      headers: googleHeaders(accessToken),
      cache: "no-store",
      redirect: "error",
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
    if (mimeType !== expectedMimeType || !ALLOWED_MIMES.has(mimeType)) {
      throw new GoogleDriveDocumentError(
        "google_drive_document_mime_mismatch",
        "El tipo real del archivo de Drive no coincide con el documento registrado.",
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

    const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > GOOGLE_DRIVE_OCR_MAX_BYTES || bytes.byteLength !== size) {
      throw new GoogleDriveDocumentError(
        bytes.byteLength > GOOGLE_DRIVE_OCR_MAX_BYTES
          ? "google_drive_document_too_large"
          : "google_drive_document_download_failed",
        "La descarga de Drive no coincide con el tamaño validado del archivo original.",
      );
    }

    return {
      bytes,
      fileId,
      fileName: asNonEmptyString(metadata?.name),
      mimeType,
      sizeBytes: size,
    };
  }
}
