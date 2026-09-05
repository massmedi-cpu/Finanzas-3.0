import { expect, test } from "@playwright/test";
import { OFFICIAL_BANK_SOURCE_HEADERS } from "../../src/domain/official-bank-source";
import {
  GoogleOfficialBankSourceReader,
  GoogleOfficialSourceReadError,
} from "../../src/infrastructure/google/official-bank-source-reader";

const spreadsheetId = "official-revision-fence-test";

function driveFile(version: number) {
  return {
    id: spreadsheetId,
    name: "Movimientos bancarios - fuente",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-09-04T19:00:00.000Z",
    version,
  };
}

const spreadsheet = {
  spreadsheetId,
  properties: {
    title: "Movimientos bancarios - fuente",
    locale: "es_ES",
    timeZone: "Europe/Madrid",
  },
  sheets: [
    {
      properties: {
        sheetId: 725351515,
        title: "Cuenta corriente · 3967",
        index: 0,
        sheetType: "GRID",
        gridProperties: { rowCount: 2, columnCount: 22 },
      },
    },
    {
      properties: {
        sheetId: 2504001,
        title: "Cuenta ahorro · 2504",
        index: 1,
        sheetType: "GRID",
        gridProperties: { rowCount: 2, columnCount: 22 },
      },
    },
  ],
};

const values = {
  valueRanges: [
    {
      range: "'Cuenta corriente · 3967'!A1:V2",
      majorDimension: "ROWS",
      values: [OFFICIAL_BANK_SOURCE_HEADERS, ["CC-FENCE-1"]],
    },
    {
      range: "'Cuenta ahorro · 2504'!A1:V2",
      majorDimension: "ROWS",
      values: [OFFICIAL_BANK_SOURCE_HEADERS, ["AH-FENCE-1"]],
    },
  ],
};

function mockGoogleFetch(versions: readonly number[]) {
  let driveReads = 0;

  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("www.googleapis.com/drive/v3/files/")) {
      const version = versions[Math.min(driveReads, versions.length - 1)];
      driveReads += 1;
      return Response.json(driveFile(version));
    }
    if (url.includes("sheets.googleapis.com/v4/spreadsheets/") && url.includes("/values:batchGet")) {
      return Response.json(values);
    }
    if (url.includes("sheets.googleapis.com/v4/spreadsheets/")) {
      return Response.json(spreadsheet);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

function reader(versions: readonly number[]) {
  return new GoogleOfficialBankSourceReader(
    spreadsheetId,
    { getAccessToken: async () => "read-only-token" },
    mockGoogleFetch(versions),
  );
}

test("Google reader accepts a snapshot only when the Drive revision stays stable", async () => {
  const snapshot = await reader([27, 27]).read();

  expect(snapshot.sourceRevision).toBe("drive-version:27");
  expect(snapshot.sheets).toHaveLength(2);
  expect(snapshot.sheets[0].rows[0][0]).toBe("CC-FENCE-1");
  expect(snapshot.sheets[1].rows[0][0]).toBe("AH-FENCE-1");
});

test("Google reader rejects a mixed snapshot when the source changes during read", async () => {
  let captured: unknown = null;

  try {
    await reader([27, 28]).read();
  } catch (error) {
    captured = error;
  }

  expect(captured).toBeInstanceOf(GoogleOfficialSourceReadError);
  expect((captured as GoogleOfficialSourceReadError).code).toBe("source_changed_during_read");
});
