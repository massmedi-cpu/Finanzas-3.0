import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { OFFICIAL_BANK_SOURCE_HEADERS, type SourceCellValue } from "../../src/domain/official-bank-source";
import type { OfficialSourceWorkbookSnapshot } from "../../src/application/source-sync-service";
import { buildSourcePostflightReport, decodePersistedSourcePostflight } from "../../src/application/source-postflight-report";

const bankRow = (key: string, product: "checking" | "savings"): SourceCellValue[] => {
  const checking = product === "checking";
  const row: SourceCellValue[] = Array(22).fill(null);
  row[0] = key;
  row[1] = "21/10/2026";
  row[3] = checking ? "Cuenta corriente Openbank · 3967" : "Cuenta ahorro Openbank · 2504";
  row[4] = "Openbank";
  row[5] = checking ? "****3967" : "****2504";
  row[6] = "Cuenta bancaria";
  row[7] = "Ingreso";
  row[10] = "PRUEBA DE CONTRATO SINTÉTICO";
  row[11] = "PRUEBA";
  row[13] = checking ? 2.5 : 1.5;
  row[14] = checking ? 9 : 1.5;
  row[19] = "No";
  return row;
};

function source(): OfficialSourceWorkbookSnapshot {
  return {
    sourceFileId: "synthetic-postflight-book",
    sourceRevision: "synthetic-rev-1",
    sheets: [
      { sourceSheetId: "725351515", title: "Cuenta corriente · 3967", headers: OFFICIAL_BANK_SOURCE_HEADERS, rows: [bankRow("S-CC-1", "checking")] },
      { sourceSheetId: "2504001", title: "Cuenta ahorro · 2504", headers: OFFICIAL_BANK_SOURCE_HEADERS, rows: [bankRow("S-AH-1", "savings")] },
    ],
  };
}

function stored(
  key: string, sheet: string, account: string, amount: string, balance: string | null,
) {
  return {
    source_file_id: "synthetic-postflight-book",
    source_sheet_id: sheet, source_row_key: key,
    account_external_key: account,
    bank_date: "2026-10-21", amount_cents: amount, balance_after_cents: balance,
  };
}

const checkingName = "Cuenta corriente Openbank · 3967";
const savingsName = "Cuenta ahorro Openbank · 2504";

test("REC-POST-288 · decodificación de BIGINT exacta y errores sin datos privados", () => {
  const valid = { rows: [
    stored("S-CC-1", "725351515", checkingName, "250", "900"),
    stored("S-AH-1", "2504001", savingsName, "150", "150"),
  ] };
  const before = JSON.stringify(valid);
  expect(decodePersistedSourcePostflight(valid, "synthetic-postflight-book")).toMatchObject([
    { amountCents: 250, balanceAfterCents: 900 }, { amountCents: 150, balanceAfterCents: 150 },
  ]);
  expect(buildSourcePostflightReport(source(), valid)).toMatchObject({
    status: "verified", sourceRows: 2, persistedRows: 2, matchingRows: 2,
    pendingRows: 0, differingRows: 0, orphanRows: 0, matchingUnknownBalances: 0,
  });
  expect(buildSourcePostflightReport(source(), { rows: [valid.rows[0]] })).toMatchObject({
    status: "pending", sourceRows: 2, persistedRows: 1, pendingRows: 1,
  });
  expect(JSON.stringify(valid)).toBe(before);
  expect(decodePersistedSourcePostflight({
    rows: [{ ...valid.rows[1], balance_after_cents: null }],
  }, "synthetic-postflight-book")[0].balanceAfterCents).toBeNull();


  for (const bad of [
    { ...valid, truncated: true }, { rows: "wrong" },
    { rows: [{ ...valid.rows[0], source_file_id: "unexpected-source" }] },
    { rows: [{ ...valid.rows[0], amount_cents: "2.5" }] },
    { rows: [{ ...valid.rows[0], amount_cents: "9007199254740992" }] },
    { rows: [{ ...valid.rows[0], balance_after_cents: "NaN" }] },
    { rows: new Array(10001).fill(valid.rows[0]) },
  ]) {
    expect(() => decodePersistedSourcePostflight(bad, "synthetic-postflight-book"))
      .toThrow("source_postflight_invalid_record");
  }
});

test("REC-POST-289 · GET de conciliación rechaza anónimos sin consultar cuentas", async ({ request }) => {
  const response = await request.get("/api/source/google/postflight");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({ error: "authentication_required" });
});

test("REC-POST-290 · la ruta exige membership y realiza dos lecturas independientes, sin mutación", () => {
  const route = readFileSync("app/api/source/google/postflight/route.ts", "utf8");
  const gate = route.indexOf("await requireVerifiedSourceWorkspace()");
  const connection = route.indexOf("await resolveGoogleSourceConnection()");
  const sourceRead = route.indexOf("await runtime.reader.read()");
  const baseline = route.indexOf("assertOfficialSourceHistoricalBaseline(buildOfficialSourcePreflightSummary(snapshot))");
  const persistenceRead = route.indexOf('callPersistenceGateway<unknown>("source.postflight_rows"');
  const aggregate = route.indexOf("buildSourcePostflightReport(snapshot, stored)");
  expect(gate).toBeGreaterThan(-1);
  expect(connection).toBeGreaterThan(gate);
  expect(sourceRead).toBeGreaterThan(connection);
  expect(baseline).toBeGreaterThan(sourceRead);
  expect(persistenceRead).toBeGreaterThan(baseline);
  expect(aggregate).toBeGreaterThan(persistenceRead);
  expect(route).not.toContain("export async function POST");
  expect(route).not.toContain('("source.sync_batch"');
  expect(route).toContain('readConsistency: "sequential_non_atomic"');
});

test("REC-POST-291 · el gateway limita filas, filtra tenant y previene exposición por preview", () => {
  const sourceSync = readFileSync("supabase/functions/financial-app-db-gateway/source-sync.ts", "utf8");
  const edge = readFileSync("supabase/functions/financial-app-db-gateway/index.ts", "utf8");
  const handler = sourceSync.slice(
    sourceSync.indexOf('if (action === "source.postflight_rows")'),
    sourceSync.indexOf('if (action === "source.status")'),
  );
  expect(handler).toContain("financial_app.transaction_source_records");
  expect(handler).toContain("workspace_id=${workspaceId[0].workspace_id}::uuid");
  expect(handler).toContain("limit 10001");
  expect(handler).toContain("rows.length > 10000");
  expect(handler).not.toMatch(/\b(insert into|update financial_app|delete from|truncate table)\b/i);
  expect(edge).toContain('"source.postflight_rows"');
  expect(edge.indexOf("await resolveWorkspaceContext(req, sql)"))
    .toBeLessThan(edge.indexOf("handleSourceSyncAction({ action, payload, sql"));
});
