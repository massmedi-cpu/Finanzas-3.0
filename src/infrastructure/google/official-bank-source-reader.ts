import type {
  OfficialSourceSheetSnapshot,
  OfficialSourceWorkbookSnapshot,
} from "../../application/source-sync-service";
import { OFFICIAL_BANK_SOURCE_HEADERS, OFFICIAL_SOURCE_SHEET_TITLES } from "../../domain/official-bank-source";

export const GOOGLE_SOURCE_READONLY_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
] as const;

export const OFFICIAL_BANK_SPREADSHEET_TITLE = "Movimientos bancarios - fuente";
export const OFFICIAL_BANK_SPREADSHEET_LOCALE = "es_ES";
export const OFFICIAL_BANK_SPREADSHEET_TIME_ZONE = "Europe/Madrid";

export interface GoogleAccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export class GoogleOfficialSourceReadError extends Error {
  constructor(
    public readonly code:
      | "missing_spreadsheet_id"
      | "google_access_token_unavailable"
      | "google_api_error"
      | "source_metadata_mismatch"
      | "source_sheet_metadata_mismatch"
      | "source_values_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "GoogleOfficialSourceReadError";
  }
}

type DriveFileMetadata = {
  id?: unknown;
  name?: unknown;
  mimeType?: unknown;
  modifiedTime?: unknown;
  version?: unknown;
};

type SpreadsheetMetadata = {
  spreadsheetId?: unknown;
  properties?: {
    title?: unknown;
    locale?: unknown;
    timeZone?: unknown;
  };
  sheets?: Array<{
    properties?: {
      sheetId?: unknown;
      title?: unknown;
      index?: unknown;
      sheetType?: unknown;
      gridProperties?: {
        rowCount?: unknown;
        columnCount?: unknown;
      };
    };
  }>;
};

type BatchValuesResponse = {
  valueRanges?: Array<{
    range?: unknown;
    majorDimension?: unknown;
    values?: unknown;
  }>;
};

export type GoogleOfficialSourcePayload = {
  spreadsheetId: string;
  driveFile: DriveFileMetadata;
  spreadsheet: SpreadsheetMetadata;
  values: BatchValuesResponse;
};

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function assertWorkbookMetadata(input: GoogleOfficialSourcePayload) {
  const driveId = asNonEmptyString(input.driveFile.id);
  const driveName = asNonEmptyString(input.driveFile.name);
  const mimeType = asNonEmptyString(input.driveFile.mimeType);
  const spreadsheetId = asNonEmptyString(input.spreadsheet.spreadsheetId);
  const title = asNonEmptyString(input.spreadsheet.properties?.title);
  const locale = asNonEmptyString(input.spreadsheet.properties?.locale);
  const timeZone = asNonEmptyString(input.spreadsheet.properties?.timeZone);

  if (
    driveId !== input.spreadsheetId ||
    spreadsheetId !== input.spreadsheetId ||
    driveName !== OFFICIAL_BANK_SPREADSHEET_TITLE ||
    title !== OFFICIAL_BANK_SPREADSHEET_TITLE ||
    mimeType !== "application/vnd.google-apps.spreadsheet" ||
    locale !== OFFICIAL_BANK_SPREADSHEET_LOCALE ||
    timeZone !== OFFICIAL_BANK_SPREADSHEET_TIME_ZONE
  ) {
    throw new GoogleOfficialSourceReadError(
      "source_metadata_mismatch",
      "La identidad o configuración del Google Sheet oficial ha cambiado y la lectura se ha detenido.",
    );
  }
}

function expectedSheetTitles() {
  return [...OFFICIAL_SOURCE_SHEET_TITLES].sort();
}

function normalizeSheetMetadata(spreadsheet: SpreadsheetMetadata) {
  if (!Array.isArray(spreadsheet.sheets)) {
    throw new GoogleOfficialSourceReadError(
      "source_sheet_metadata_mismatch",
      "Google Sheets no ha devuelto metadatos de pestañas válidos.",
    );
  }

  const normalized = spreadsheet.sheets.map((sheet) => {
    const id = asInteger(sheet.properties?.sheetId);
    const title = asNonEmptyString(sheet.properties?.title);
    const index = asInteger(sheet.properties?.index);
    const sheetType = asNonEmptyString(sheet.properties?.sheetType);
    const rowCount = asInteger(sheet.properties?.gridProperties?.rowCount);
    const columnCount = asInteger(sheet.properties?.gridProperties?.columnCount);

    if (
      id === null ||
      title === null ||
      index === null ||
      sheetType !== "GRID" ||
      rowCount === null ||
      rowCount < 1 ||
      columnCount !== OFFICIAL_BANK_SOURCE_HEADERS.length
    ) {
      throw new GoogleOfficialSourceReadError(
        "source_sheet_metadata_mismatch",
        "La estructura de una pestaña del Google Sheet oficial ya no coincide con el contrato validado.",
      );
    }

    return { sourceSheetId: String(id), title, index, rowCount };
  });

  const expected = expectedSheetTitles();
  const actual = normalized.map((sheet) => sheet.title).sort();
  if (actual.length !== expected.length || actual.some((title, index) => title !== expected[index])) {
    throw new GoogleOfficialSourceReadError(
      "source_sheet_metadata_mismatch",
      `El Google Sheet oficial debe contener exactamente estas pestañas: ${expected.join(", ")}.`,
    );
  }

  return normalized.sort((a, b) => a.index - b.index);
}

function isNonEmptyRow(row: readonly unknown[]) {
  return row.some((value) => value !== null && value !== undefined && value !== "");
}

function normalizeValueRanges(
  metadata: ReturnType<typeof normalizeSheetMetadata>,
  response: BatchValuesResponse,
): OfficialSourceSheetSnapshot[] {
  if (!Array.isArray(response.valueRanges) || response.valueRanges.length !== metadata.length) {
    throw new GoogleOfficialSourceReadError(
      "source_values_mismatch",
      "Google Sheets no ha devuelto todos los rangos de la fuente oficial.",
    );
  }

  return metadata.map((sheet, index) => {
    const rawValues = response.valueRanges?.[index]?.values;
    const values = Array.isArray(rawValues) ? rawValues : [];
    const rows = values.filter(Array.isArray) as unknown[][];
    const headers = rows[0] ?? [];
    const movements = rows.slice(1).filter(isNonEmptyRow);

    return {
      sourceSheetId: sheet.sourceSheetId,
      title: sheet.title,
      headers,
      rows: movements,
    };
  });
}

function sourceRevision(driveFile: DriveFileMetadata) {
  const version =
    typeof driveFile.version === "number" || typeof driveFile.version === "string"
      ? String(driveFile.version).trim()
      : "";
  if (version) return `drive-version:${version}`;

  const modifiedTime = asNonEmptyString(driveFile.modifiedTime);
  return modifiedTime ? `drive-modified:${modifiedTime}` : null;
}

export function normalizeGoogleOfficialSourcePayload(
  input: GoogleOfficialSourcePayload,
): OfficialSourceWorkbookSnapshot {
  if (!input.spreadsheetId.trim()) {
    throw new GoogleOfficialSourceReadError(
      "missing_spreadsheet_id",
      "Falta el identificador del Google Sheet oficial.",
    );
  }

  assertWorkbookMetadata(input);
  const metadata = normalizeSheetMetadata(input.spreadsheet);

  return {
    sourceFileId: input.spreadsheetId.trim(),
    sourceRevision: sourceRevision(input.driveFile),
    sheets: normalizeValueRanges(metadata, input.values),
  };
}

function quoteA1SheetTitle(title: string) {
  return `'${title.replaceAll("'", "''")}'`;
}

function googleHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
  };
}

async function readJson(
  fetcher: typeof fetch,
  url: string,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    method: "GET",
    headers: googleHeaders(accessToken),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GoogleOfficialSourceReadError(
      "google_api_error",
      `Google ha rechazado una lectura de la fuente oficial con estado ${response.status}.`,
    );
  }

  const body = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GoogleOfficialSourceReadError(
      "google_api_error",
      "Google ha devuelto una respuesta no válida al leer la fuente oficial.",
    );
  }
  return body as Record<string, unknown>;
}

export class GoogleOfficialBankSourceReader {
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly spreadsheetId: string,
    private readonly accessTokens: GoogleAccessTokenProvider,
    fetcher: typeof fetch = fetch,
  ) {
    this.fetcher = fetcher;
  }

  async read(): Promise<OfficialSourceWorkbookSnapshot> {
    const spreadsheetId = this.spreadsheetId.trim();
    if (!spreadsheetId) {
      throw new GoogleOfficialSourceReadError(
        "missing_spreadsheet_id",
        "Falta el identificador del Google Sheet oficial.",
      );
    }

    const accessToken = (await this.accessTokens.getAccessToken()).trim();
    if (!accessToken) {
      throw new GoogleOfficialSourceReadError(
        "google_access_token_unavailable",
        "No hay un token OAuth de Google válido para realizar la lectura.",
      );
    }

    const encodedId = encodeURIComponent(spreadsheetId);
    const driveUrl =
      `https://www.googleapis.com/drive/v3/files/${encodedId}` +
      "?fields=id,name,mimeType,modifiedTime,version";
    const spreadsheetUrl =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodedId}` +
      "?fields=spreadsheetId,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,sheetType,gridProperties(rowCount,columnCount)))";

    const [driveFile, spreadsheet] = await Promise.all([
      readJson(this.fetcher, driveUrl, accessToken),
      readJson(this.fetcher, spreadsheetUrl, accessToken),
    ]);

    const metadata = normalizeSheetMetadata(spreadsheet as SpreadsheetMetadata);
    const params = new URLSearchParams({
      majorDimension: "ROWS",
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
    });
    for (const sheet of metadata) {
      params.append("ranges", `${quoteA1SheetTitle(sheet.title)}!A1:V${sheet.rowCount}`);
    }

    const values = await readJson(
      this.fetcher,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodedId}/values:batchGet?${params.toString()}`,
      accessToken,
    );

    return normalizeGoogleOfficialSourcePayload({
      spreadsheetId,
      driveFile: driveFile as DriveFileMetadata,
      spreadsheet: spreadsheet as SpreadsheetMetadata,
      values: values as BatchValuesResponse,
    });
  }
}
