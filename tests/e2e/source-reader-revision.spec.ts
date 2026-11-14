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

function mockGoogleFetch(versions: readonly number[], returnedValues: unknown = values) {
  let driveReads = 0;

  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("www.googleapis.com/drive/v3/files/")) {
      const version = versions[Math.min(driveReads, versions.length - 1)];
      driveReads += 1;
      return Response.json(driveFile(version));
    }
    if (url.includes("sheets.googleapis.com/v4/spreadsheets/") && url.includes("/values:batchGet")) {
      return Response.json(returnedValues);
    }
    if (url.includes("sheets.googleapis.com/v4/spreadsheets/")) {
      return Response.json(spreadsheet);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

function reader(versions: readonly number[], returnedValues: unknown = values) {
  return new GoogleOfficialBankSourceReader(
    spreadsheetId,
    { getAccessToken: async () => "read-only-token" },
    mockGoogleFetch(versions, returnedValues),
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

test("REC-SOURCE-READ-181 · rechaza rangos intercambiados aunque sus cabeceras sean idénticas", async () => {
  const swapped = structuredClone(values);
  swapped.valueRanges.reverse();
  await expect(reader([27, 27], swapped).read()).rejects.toMatchObject({
    code: "source_values_mismatch",
  });
});

test("REC-SOURCE-READ-182 · un rango truncado o sin identidad impide atribuir filas bancarias", async () => {
  for (const range of ["'Cuenta corriente · 3967'!A1:V1", "A1:V2", undefined]) {
    const payload = structuredClone(values) as {
      valueRanges: Array<{ range?: string; majorDimension: string; values: unknown[][] }>;
    };
    payload.valueRanges[0].range = range;
    await expect(reader([27, 27], payload).read()).rejects.toMatchObject({
      code: "source_values_mismatch",
    });
  }
});

test("REC-SOURCE-READ-183 · rechaza columnas, filas malformadas y datos fuera de la cuadrícula", async () => {
  const columnOriented = structuredClone(values);
  columnOriented.valueRanges[0].majorDimension = "COLUMNS";
  await expect(reader([27, 27], columnOriented).read()).rejects.toMatchObject({
    code: "source_values_mismatch",
  });

  const malformed = {
    valueRanges: [
      { ...values.valueRanges[0], values: [OFFICIAL_BANK_SOURCE_HEADERS, { data: "fila-inválida" }] },
      values.valueRanges[1],
    ],
  };
  await expect(reader([27, 27], malformed).read()).rejects.toMatchObject({
    code: "source_values_mismatch",
  });

  const tooManyRows = {
    valueRanges: [
      { ...values.valueRanges[0], values: [OFFICIAL_BANK_SOURCE_HEADERS, ["CC-1"], ["CC-2"]] },
      values.valueRanges[1],
    ],
  };
  await expect(reader([27, 27], tooManyRows).read()).rejects.toMatchObject({
    code: "source_values_mismatch",
  });
});
