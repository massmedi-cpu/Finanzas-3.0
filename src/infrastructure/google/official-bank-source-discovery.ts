import { OFFICIAL_BANK_SPREADSHEET_TITLE } from "./official-bank-source-reader";

export class GoogleOfficialSourceDiscoveryError extends Error {
  constructor(
    public readonly code:
      | "google_source_discovery_failed"
      | "google_source_not_found"
      | "google_source_ambiguous",
    message: string,
  ) {
    super(message);
    this.name = "GoogleOfficialSourceDiscoveryError";
  }
}

type DriveFile = {
  id?: unknown;
  name?: unknown;
  mimeType?: unknown;
  trashed?: unknown;
};

type DriveFileListResponse = {
  files?: unknown;
};

function requireAccessToken(value: string) {
  const token = value.trim();
  if (!token) {
    throw new GoogleOfficialSourceDiscoveryError(
      "google_source_discovery_failed",
      "No hay un token OAuth válido para localizar la fuente oficial.",
    );
  }
  return token;
}

function quoteDriveQueryLiteral(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function normalizeDriveFiles(payload: DriveFileListResponse) {
  if (!Array.isArray(payload.files)) {
    throw new GoogleOfficialSourceDiscoveryError(
      "google_source_discovery_failed",
      "Google Drive no ha devuelto una lista de archivos válida.",
    );
  }

  return payload.files.filter((file): file is DriveFile => Boolean(file) && typeof file === "object");
}

export async function discoverOfficialBankSpreadsheetId(
  accessToken: string,
  fetcher: typeof fetch = fetch,
) {
  const token = requireAccessToken(accessToken);
  const query = [
    `name = '${quoteDriveQueryLiteral(OFFICIAL_BANK_SPREADSHEET_TITLE)}'`,
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    "trashed = false",
  ].join(" and ");
  const params = new URLSearchParams({
    q: query,
    spaces: "drive",
    pageSize: "10",
    fields: "files(id,name,mimeType,trashed)",
  });

  const response = await fetcher(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as DriveFileListResponse | null;
  if (!response.ok || !payload) {
    throw new GoogleOfficialSourceDiscoveryError(
      "google_source_discovery_failed",
      `Google Drive ha rechazado la localización de la fuente oficial con estado ${response.status}.`,
    );
  }

  const candidates = normalizeDriveFiles(payload).filter(
    (file) =>
      typeof file.id === "string" &&
      Boolean(file.id.trim()) &&
      file.name === OFFICIAL_BANK_SPREADSHEET_TITLE &&
      file.mimeType === "application/vnd.google-apps.spreadsheet" &&
      file.trashed !== true,
  );

  if (candidates.length === 0) {
    throw new GoogleOfficialSourceDiscoveryError(
      "google_source_not_found",
      `No se ha encontrado la fuente oficial “${OFFICIAL_BANK_SPREADSHEET_TITLE}”.`,
    );
  }
  if (candidates.length !== 1) {
    throw new GoogleOfficialSourceDiscoveryError(
      "google_source_ambiguous",
      `Hay más de un Google Sheet llamado “${OFFICIAL_BANK_SPREADSHEET_TITLE}”; la conexión se detiene para no elegir por suposición.`,
    );
  }

  return (candidates[0].id as string).trim();
}
