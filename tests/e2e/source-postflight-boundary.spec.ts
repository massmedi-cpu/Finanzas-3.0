import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { OFFICIAL_BANK_SOURCE_HEADERS, type SourceCellValue } from "../../src/domain/official-bank-source";
import type { OfficialSourceWorkbookSnapshot } from "../../src/application/source-sync-service";
import { buildSourcePostflightReport, decodePersistedSourcePostflight } from "../../src/application/source-postflight-report";
import { prepareOfficialSourceSyncBatch } from "../../src/application/source-sync-service";
import { requireAppendOnlySourceDisposition } from "../../supabase/functions/financial-app-db-gateway/source-sync";

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
  const sourceFingerprint = prepareOfficialSourceSyncBatch(source()).observations
    .find(row => row.sourceSheetId === sheet && row.sourceRowKey === key)?.sourceFingerprint;
  if (!sourceFingerprint) throw new Error("synthetic_postflight_row_missing");
  return {
    source_file_id: "synthetic-postflight-book",
    source_sheet_id: sheet, source_row_key: key, source_fingerprint: sourceFingerprint,
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
    { rows: [{ ...valid.rows[0], source_fingerprint: "changed-private-row" }] },
    { rows: [{ ...valid.rows[0], source_fingerprint: undefined }] },
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
  expect(handler).toContain("source_fingerprint");
  expect(handler).toContain("workspace_id=${workspaceId[0].workspace_id}::uuid");
  expect(handler).toContain("limit 10001");
  expect(handler).toContain("rows.length > 10000");
  expect(handler).not.toMatch(/\b(insert into|update financial_app|delete from|truncate table)\b/i);
  expect(edge).toContain('"source.postflight_rows"');
  expect(edge.indexOf("await resolveWorkspaceContext(req, sql)"))
    .toBeLessThan(edge.indexOf("handleSourceSyncAction({ action, payload, sql"));
});


async function mockSourceOverviewForPostflight(page: import("@playwright/test").Page, response: {
  status?: number; payload?: unknown;
} = {}) {
  let mutationCalls = 0;
  await page.route("**/api/source/google/status", route => route.fulfill({ json: {
    configured: true, authMode: "service-account",
    connection: { connected: true, accountEmail: "synthetic@example.invalid",
      sourceFileName: "Synthetic workbook", readonly: true, managed: true, lastVerifiedAt: null },
  } }));
  await page.route("**/api/health/source-runtime", route => route.fulfill({ json: {
    status: "ok", compatible: true,
  } }));
  await page.route("**/api/source/google/sync", route => {
    if (route.request().method() !== "GET") mutationCalls++;
    return route.fulfill({ json: { run: null, cursors: [] } });
  });
  await page.route("**/api/source/google/postflight", route => {
    if (route.request().method() !== "GET") mutationCalls++;
    return route.fulfill({
      status: response.status ?? 200,
      json: response.payload ?? {
        status: "pending", scope: "supplied_snapshots_only",
        sourceRows: 3, persistedRows: 2, matchingRows: 2,
        pendingRows: 1, orphanRows: 0, differingRows: 0,
        matchingUnknownBalances: 1,
        differences: { account: 0, bankDate: 0, amountCents: 0, balanceAfterCents: 0, sourceFingerprint: 0 },
        accounts: [{ accountLabel: "Cuenta 1", sourceRows: 3,
          persistedRows: 2, matchingRows: 2, pendingRows: 1, orphanRows: 0, differingRows: 0 }],
      },
    });
  });
  return { mutations: () => mutationCalls };
}

test("REC-POST-292 · la interfaz muestra pendientes reales como pendientes sin POST ni falsos éxitos", async ({ page }) => {
  const source = await mockSourceOverviewForPostflight(page);
  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Conciliar con datos guardados" }).click();
  const report = page.getByRole("region", { name: "Conciliación con los movimientos guardados" });
  await expect(report).toContainText("Hay movimientos pendientes de incorporar");
  await expect(report).toContainText("Sin modificar datos");
  await expect(report).toContainText("Coincidentes");
  await expect(report).toContainText("Pendientes");
  await expect(report).toContainText("saldos desconocidos");
  await expect(report).toContainText("no a una transacción atómica");
  expect(source.mutations()).toBe(0);
});

test("REC-POST-293 · un postflight inválido no se presenta como éxito", async ({ page }) => {
  const state = await mockSourceOverviewForPostflight(page, { payload: {
    status: "verified", scope: "supplied_snapshots_only",
    sourceRows: 100, persistedRows: 2, matchingRows: 2, pendingRows: 0,
    orphanRows: 0, differingRows: 0, accounts: [],
  } });
  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Conciliar con datos guardados" }).click();
  await expect(page.locator(".config-message.error")).toContainText("resultados completos y verificables");
  await expect(page.getByRole("region", { name: "Conciliación con los movimientos guardados" })).toHaveCount(0);
  expect(state.mutations()).toBe(0);
});

test("REC-POST-294 · sesión caducada revoca el reporte y los botones", async ({ page }) => {
  const state = await mockSourceOverviewForPostflight(page, {
    status: 401, payload: { error: "authentication_required" },
  });
  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Conciliar con datos guardados" }).click();
  await expect(page.locator(".config-message.error")).toContainText("Inicia sesión");
  await expect(page.getByRole("button", { name: "Conciliar con datos guardados" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Conciliación con los movimientos guardados" })).toHaveCount(0);
  expect(state.mutations()).toBe(0);
});


test("REC-POST-297 · la ruta anonimiza cada cuenta y no expone huellas ni revisiones privadas", () => {
  const route = readFileSync("app/api/source/google/postflight/route.ts", "utf8");
  const index = route.indexOf("...toPublicSourcePostflightReport(report)");
  expect(index).toBeGreaterThan(route.indexOf("buildSourcePostflightReport(snapshot, stored)"));
  expect(route).not.toContain("...report,");
  expect(route).not.toContain("sourceRevision: summary.sourceRevision");
  expect(route).not.toContain("snapshotFingerprint: summary.snapshotFingerprint");
});

test("REC-POST-336 · una respuesta paginada o con campos nuevos nunca se certifica como completa", () => {
  const canonical = { rows: [
    stored("S-CC-1", "725351515", checkingName, "250", "900"),
    stored("S-AH-1", "2504001", savingsName, "150", "150"),
  ] };
  expect(buildSourcePostflightReport(source(), canonical).status).toBe("verified");

  // Previously accepted despite an explicit indication of incomplete data.
  for (const invalid of [
    { ...canonical, hasMore: true },
    { ...canonical, hasMore: false },
    { ...canonical, nextCursor: "synthetic-private-cursor" },
    { ...canonical, complete: false },
    { ...canonical, truncated: false },
    { ...canonical, rows: [{ ...canonical.rows[0], extra_private_column: "synthetic-secret" }] },
    { ...canonical, rows: [{ ...canonical.rows[0], balance_after_cents: undefined }] },
  ]) {
    expect(() => buildSourcePostflightReport(source(), invalid))
      .toThrow("source_postflight_invalid_record");
  }
  expect(decodePersistedSourcePostflight(canonical, "synthetic-postflight-book")).toHaveLength(2);
});

test("REC-POST-349 · full source hash mismatch is never called verified by the gateway decoder", () => {
  const valid = { rows: [
    stored("S-CC-1", "725351515", checkingName, "250", "900"),
    stored("S-AH-1", "2504001", savingsName, "150", "150"),
  ] };
  expect(buildSourcePostflightReport(source(), valid).status).toBe("verified");
  const mutated = {
    rows: [{ ...valid.rows[0], source_fingerprint: "f".repeat(64) }, valid.rows[1]],
  };
  const result = buildSourcePostflightReport(source(), mutated);
  expect(result).toMatchObject({
    status: "blocked", sourceRows: 2, matchingRows: 1, differingRows: 1,
    differences: { sourceFingerprint: 1, account: 0, amountCents: 0, bankDate: 0, balanceAfterCents: 0 },
  });
});


// REC-SYNC-352/353: hard gates for the server-side append-only precheck and
// its independent read-after-write, without contacting private bank systems.
test("REC-SYNC-352 · existing source divergence blocks the POST before any write", () => {
  const source = readFileSync("app/api/source/google/sync/route.ts", "utf8");
  const auth = source.indexOf("await requireSourceSession()");
  const confirmation = source.indexOf("matchesSourcePreflightConfirmation(confirmation, summary)");
  const preRead = source.indexOf('callPersistenceGateway<unknown>("source.postflight_rows"');
  const baseline = source.indexOf("isSafeAppendOnlySourceBaseline(beforeReport)");
  const mutation = source.indexOf("await runtime.synchronization.synchronize(snapshot)");
  expect(auth).toBeGreaterThan(-1);
  expect(confirmation).toBeGreaterThan(auth);
  expect(preRead).toBeGreaterThan(confirmation);
  expect(baseline).toBeGreaterThan(preRead);
  expect(mutation).toBeGreaterThan(baseline);
  expect(source.slice(baseline, mutation)).toContain("google_source_existing_rows_changed");
  expect(source.slice(baseline, mutation)).toContain("status: 409");
  expect(source).not.toContain("ignoreSourceFingerprint");
});

test("REC-SYNC-353 · POST validates actual persisted rows after mutation and before success", () => {
  const source = readFileSync("app/api/source/google/sync/route.ts", "utf8");
  const mutation = source.indexOf("await runtime.synchronization.synchronize(snapshot)");
  const receipt = source.indexOf("isSourceSyncResultForPreflight(result, summary)");
  const revised = source.indexOf("result.rowsRevised !== 0");
  const afterRead = source.indexOf('callPersistenceGateway<unknown>("source.postflight_rows"', mutation);
  const proof = source.indexOf("isCompleteSourceSyncPostflight(afterReport)");
  const success = source.indexOf("return Response.json(\n      {\n        ...result");
  expect(receipt).toBeGreaterThan(mutation);
  expect(revised).toBeGreaterThan(receipt);
  expect(afterRead).toBeGreaterThan(revised);
  expect(proof).toBeGreaterThan(afterRead);
  expect(success).toBeGreaterThan(proof);
  expect(source.slice(mutation, success)).toContain("google_source_sync_unconfirmed");
  expect(source.slice(mutation, success)).toContain("status: 502");
});

test("REC-SYNC-357 · atomic source batch rolls back every historic revision including races", () => {
  expect(requireAppendOnlySourceDisposition("insert")).toBe("insert");
  expect(requireAppendOnlySourceDisposition("skip")).toBe("skip");
  expect(() => requireAppendOnlySourceDisposition("append_revision"))
    .toThrow("source_existing_rows_changed");
  expect(() => requireAppendOnlySourceDisposition("unexpected_action"))
    .toThrow("source_ingestion_unknown_action");

  const edge = readFileSync("supabase/functions/financial-app-db-gateway/source-sync.ts", "utf8");
  const start = edge.indexOf('if (action === "source.sync_batch")');
  const transaction = edge.indexOf("await sql.begin(async (tx: any) => {", start);
  const ingestion = edge.indexOf("select * from financial_app.ingest_source_observation(", transaction);
  const guard = edge.indexOf("requireAppendOnlySourceDisposition(row.action)", ingestion);
  const completion = edge.indexOf("set status='success'", guard);
  const catchBlock = edge.indexOf("} catch (error) {", completion);
  expect(start).toBeGreaterThan(-1);
  expect(transaction).toBeGreaterThan(start);
  expect(ingestion).toBeGreaterThan(transaction);
  expect(guard).toBeGreaterThan(ingestion);
  expect(completion).toBeGreaterThan(guard);
  expect(catchBlock).toBeGreaterThan(completion);
  expect(edge.slice(start, catchBlock)).not.toContain("rowsRevised += 1");
  expect(edge.slice(catchBlock)).toContain('historicConflict ? 409 : 400');

  // API converts only the exact domain code into a conflict; neither secrets
  // nor the legacy generic SQL error are reflected to the browser.
  const api = readFileSync("app/api/source/google/sync/route.ts", "utf8");
  expect(api).toContain('error.code === "google_source_existing_rows_changed"');
  expect(api).toContain('{ error: "google_source_existing_rows_changed" }');
});
