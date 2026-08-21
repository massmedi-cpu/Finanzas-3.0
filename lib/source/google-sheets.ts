import { google } from "googleapis";
import { SOURCE_HEADERS, type SourceRow, type SourceSnapshot } from "@/lib/source/types";
import { sourceRowHash } from "@/lib/source/hash";

export const OFFICIAL_SOURCE_TABS = [
  "Cuenta corriente · 3967",
  "Cuenta ahorro · 2504",
] as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

export async function readOfficialSource(): Promise<SourceSnapshot[]> {
  const spreadsheetId = required("GOOGLE_SHEETS_ID");
  const auth = new google.auth.JWT({
    email: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: normalizePrivateKey(required("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const snapshots: SourceSnapshot[] = [];

  for (const sheetName of OFFICIAL_SOURCE_TABS) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A:V`,
      valueRenderOption: "FORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });
    const values = response.data.values ?? [];
    const [headerRow, ...rows] = values;
    if (!headerRow || SOURCE_HEADERS.some((header, index) => headerRow[index] !== header)) {
      throw new Error(`La estructura de la fuente ha cambiado en ${sheetName}`);
    }

    for (const rowValues of rows) {
      const raw = Object.fromEntries(
        SOURCE_HEADERS.map((header, index) => [header, rowValues[index] ?? null]),
      ) as SourceRow;
      const sourceId = raw["ID origen"];
      if (!sourceId) continue;
      snapshots.push({ sheetName, sourceId, sourceHash: sourceRowHash(raw), raw });
    }
  }

  return snapshots;
}
