import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildOfficialSourcePreflightSummary } from "../../src/application/source-preflight";
import {
  isConfirmedSourcePreflight, isConfirmedSourceSyncResult, isConfirmedSourceSyncResponse,
  isSourcePreflightConfirmation, matchesSourcePreflightConfirmation, sourcePreflightConfirmation,
} from "../../src/application/source-confirmation-contract";
import { summarizeSourceBalanceContinuity } from "../../src/domain/source-balance-continuity";
import { readOfficialSourcePreflight, synchronizeOfficialSource } from "../../src/application/source-sync-client";
import AxeBuilder from "@axe-core/playwright";
import { prepareOfficialSourceSyncBatch, SourceWorkbookContractError, type OfficialSourceWorkbookSnapshot } from "../../src/application/source-sync-service";
import { OFFICIAL_BANK_SOURCE_HEADERS, type SourceCellValue } from "../../src/domain/official-bank-source";

const currentRow: SourceCellValue[] = [
  "CC-PREFLIGHT-1",
  "04/09/2026",
  null,
  "Cuenta corriente Openbank · 3967",
  "Openbank",
  "****3967",
  "Cuenta bancaria",
  "Ingreso",
  "Otros ingresos",
  "Prueba",
  "INGRESO PREFLIGHT",
  "INGRESO PREFLIGHT",
  "Openbank",
  1,
  1,
  "Cuenta",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Prueba preflight",
];

const prepaidRow: SourceCellValue[] = [
  "TP-PREFLIGHT-1",
  "03/09/2026",
  null,
  "Tarjeta prepago Openbank · 8403",
  "Openbank",
  "****8403",
  "Tarjeta",
  "Gasto",
  "Compras",
  "Prueba",
  "COMPRA PREFLIGHT",
  "COMPRA PREFLIGHT",
  "Comercio prueba",
  -0.5,
  null,
  "Tarjeta prepago",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Prueba preflight",
];

const savingsRow: SourceCellValue[] = [
  "AH-PREFLIGHT-1",
  "04/09/2026",
  null,
  "Cuenta ahorro Openbank · 2504",
  "Openbank",
  "****2504",
  "Cuenta bancaria",
  "Ingreso",
  "Ingresos financieros",
  "Intereses cuenta ahorro",
  "LIQUIDACION PREFLIGHT",
  "LIQUIDACION PREFLIGHT",
  "Openbank",
  2,
  2,
  "Abono de intereses",
  null,
  null,
  "No aplica",
  "No",
  null,
  "Prueba preflight",
];

function snapshot(): OfficialSourceWorkbookSnapshot {
  return {
    sourceFileId: "preflight-source-test",
    sourceRevision: "drive-version:preflight",
    sheets: [
      {
        sourceSheetId: "725351515",
        title: "Cuenta corriente · 3967",
        headers: OFFICIAL_BANK_SOURCE_HEADERS,
        rows: [currentRow, prepaidRow],
      },
      {
        sourceSheetId: "2504001",
        title: "Cuenta ahorro · 2504",
        headers: OFFICIAL_BANK_SOURCE_HEADERS,
        rows: [savingsRow],
      },
    ],
  };
}

test("preflight resume los tres productos sin perder el orden físico que usarán los cursores", () => {
  const summary = buildOfficialSourcePreflightSummary(snapshot());

  expect(summary.totalAuthoritativeRows).toBe(3);
  expect(summary.accounts).toHaveLength(3);
  expect(summary.cursors).toEqual([
    {
      sourceSheetId: "725351515",
      sheetTitle: "Cuenta corriente · 3967",
      authoritativeRows: 2,
      lastSourceRowKey: "TP-PREFLIGHT-1",
    },
    {
      sourceSheetId: "2504001",
      sheetTitle: "Cuenta ahorro · 2504",
      authoritativeRows: 1,
      lastSourceRowKey: "AH-PREFLIGHT-1",
    },
  ]);

  const checking = summary.accounts.find((account) => account.accountType === "checking");
  const savings = summary.accounts.find((account) => account.accountType === "savings");
  const prepaid = summary.accounts.find((account) => account.accountExternalKey.includes("prepago"));

  expect(checking).toMatchObject({ authoritativeRows: 1, openingBalanceCents: 0, latestBalanceAfterCents: 100 });
  expect(savings).toMatchObject({ authoritativeRows: 1, openingBalanceCents: 0, latestBalanceAfterCents: 200 });
  expect(prepaid).toMatchObject({
    authoritativeRows: 1,
    openingBalanceCents: 0,
    latestBalanceAfterCents: null,
    lifecycle: "archived",
    accountType: "other",
  });
});


test("REC-SYNC-202 · el preflight canónico es aceptado y los recibos incompletos no", () => {
  const valid = buildOfficialSourcePreflightSummary(snapshot());
  expect(isConfirmedSourcePreflight(valid)).toBe(true);
  expect(isConfirmedSourcePreflight({ ...valid, schemaFingerprint: "wrong" })).toBe(false);
  expect(isConfirmedSourcePreflight({ ...valid, cursors: [] })).toBe(false);
  expect(isConfirmedSourcePreflight({ ...valid, totalAuthoritativeRows: 100 })).toBe(false);
});

test("REC-SYNC-203 · solo un recibo de importación coherente certifica éxito", () => {
  const receipt = {
    status: "success",
    syncRunId: "11111111-1111-4111-8111-111111111111",
    rowsSeen: 3,
    rowsInserted: 1,
    rowsRevised: 0,
    rowsSkipped: 2,
    rowsMissing: 0,
    duplicatesDetected: 0,
    warningsCount: 0,
    cursorsAdvanced: 2,
  };
  expect(isConfirmedSourceSyncResult(receipt)).toBe(true);
  expect(isConfirmedSourceSyncResult({ ...receipt, status: "partial" })).toBe(false);
  expect(isConfirmedSourceSyncResult({ ...receipt, rowsInserted: "1" })).toBe(false);
  expect(isConfirmedSourceSyncResult({ ...receipt, rowsSeen: 999 })).toBe(false);
  expect(isConfirmedSourceSyncResult({ ...receipt, syncRunId: null })).toBe(false);
});

test("REC-SYNC-240 · el preflight rechaza identidades duplicadas y fechas incoherentes aunque sumen las filas", () => {
  const valid = buildOfficialSourcePreflightSummary(snapshot());
  expect(isConfirmedSourcePreflight(valid)).toBe(true);

  // Los tres productos incluyen dos con una sola fila: duplicar el primero
  // mantiene intacto el total, pero oculta otro producto bancario.
  const repeatedAccounts = { ...valid, accounts: [valid.accounts[0], valid.accounts[0], valid.accounts[2]] };
  expect(repeatedAccounts.accounts.reduce((total, item) => total + item.authoritativeRows, 0))
    .toBe(valid.totalAuthoritativeRows);
  expect(isConfirmedSourcePreflight(repeatedAccounts)).toBe(false);

  const repeatedCursors = {
    ...valid,
    cursors: [
      { ...valid.cursors[0], authoritativeRows: 1 },
      { ...valid.cursors[0], authoritativeRows: 2 },
    ],
  };
  expect(repeatedCursors.cursors.reduce((total, item) => total + item.authoritativeRows, 0))
    .toBe(valid.totalAuthoritativeRows);
  expect(isConfirmedSourcePreflight(repeatedCursors)).toBe(false);

  const changedAccount = (changes: Record<string, unknown>) => ({
    ...valid,
    accounts: [{ ...valid.accounts[0], ...changes }, ...valid.accounts.slice(1)],
  });
  expect(isConfirmedSourcePreflight(changedAccount({ newestBankDate: "2026-02-31" }))).toBe(false);
  expect(isConfirmedSourcePreflight(changedAccount({
    oldestBankDate: "2026-10-20",
    newestBankDate: "2026-01-01",
  }))).toBe(false);
  expect(isConfirmedSourcePreflight(changedAccount({ oldestBankDate: null }))).toBe(false);
});

test("REC-SYNC-241 · prevalidación inválida y relectura de estado impiden todo POST de sincronización", async ({ page }) => {
  const valid = buildOfficialSourcePreflightSummary(snapshot());
  // Counts still add up, but the account identity is duplicated.
  let receivedPreflight: unknown = {
    ...valid,
    accounts: [valid.accounts[0], valid.accounts[0], valid.accounts[2]],
  };
  let synchronizationPosts = 0;

  await page.route("**/api/source/google/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      configured: true,
      authMode: "service-account",
      connection: {
        connected: true,
        accountEmail: "reader@example.invalid",
        sourceFileName: "Movimientos bancarios - fuente",
        connectedAt: null,
        lastVerifiedAt: null,
        readonly: true,
        managed: true,
      },
    }),
  }));
  await page.route("**/api/health/source-runtime", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      status: "ok",
      compatible: true,
      capabilities: { contractVersion: 2, sourceAccountLifecycle: true, canonicalProductSelection: true },
    }),
  }));
  await page.route("**/api/source/google/sync", (route) => {
    if (route.request().method() === "POST") {
      synchronizationPosts += 1;
      return route.fulfill({ status: 503, body: "No financial persistence is allowed in this test" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run: null, cursors: [] }),
    });
  });
  await page.route("**/api/source/google/preflight", (route) => {
    expect(route.request().method()).toBe("POST");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(receivedPreflight),
    });
  });

  // /configuration/source is the simple overview, while SourceClient with a
  // separate Validate button lives at /configuration/source/diagnostics.
  await page.goto("/configuration/source/diagnostics");
  const validate = page.getByRole("button", { name: "Validar fuente antes de importar" });
  await expect(validate).toBeEnabled();
  await validate.click();
  // The page also renders a global action-feedback alert and a Next.js route
  // announcer. Assert the actual source-form error, not an ambiguous ARIA role.
  await expect(page.locator(".config-message.error")).toContainText("No se permite importar");
  await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toHaveCount(0);
  expect(synchronizationPosts).toBe(0);

  // A successful check can enable the control, but reading status again
  // must revoke the approval, rather than silently reusing an old snapshot.
  receivedPreflight = valid;
  await validate.click();
  await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toBeEnabled();
  await page.getByRole("button", { name: "Comprobar estado" }).click();
  await expect(page.getByRole("button", { name: "Validar fuente antes de importar" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toHaveCount(0);
  expect(synchronizationPosts).toBe(0);
});

test("REC-SYNC-242 · el backend valida el resumen canónico antes de permitir syncBatch", () => {
  const route = readFileSync("app/api/source/google/sync/route.ts", "utf8");
  const post = route.indexOf("export async function POST(request: Request)");
  const summary = route.indexOf("assertOfficialSourceHistoricalBaseline(buildOfficialSourcePreflightSummary(snapshot))", post);
  const gate = route.indexOf("if (!isConfirmedSourcePreflight(summary))", summary);
  const sync = route.indexOf("runtime.synchronization.synchronize(snapshot)", gate);
  expect(post).toBeGreaterThan(-1);
  expect(summary).toBeGreaterThan(post);
  expect(gate).toBeGreaterThan(summary);
  expect(sync).toBeGreaterThan(gate);
  expect(route.slice(gate, sync)).toContain('status: 422');
});

// These are synthetic source rows and a real local browser. No Google source or
// production database is accessed by this suite.
test("REC-SYNC-262 · confirmación ligada a contenido, orden, esquema y revisión completos", () => {
  const original = snapshot();
  const before = JSON.stringify(original);
  const summary = buildOfficialSourcePreflightSummary(original);
  const confirmation = sourcePreflightConfirmation(summary);
  expect(isSourcePreflightConfirmation(confirmation)).toBe(true);
  expect(matchesSourcePreflightConfirmation(confirmation, summary)).toBe(true);
  expect(buildOfficialSourcePreflightSummary(snapshot()).snapshotFingerprint).toBe(summary.snapshotFingerprint);

  // Same revision, same row count and same opening balance: only the original
  // concept changes. Checking revision/counts alone would accept this change.
  const changed = structuredClone(original);
  (changed.sheets[0].rows[0] as unknown[])[10] = "CONCEPTO RECTIFICADO";
  const next = buildOfficialSourcePreflightSummary(changed);
  expect(next.sourceRevision).toBe(summary.sourceRevision);
  expect(next.totalAuthoritativeRows).toBe(summary.totalAuthoritativeRows);
  expect(next.schemaFingerprint).toBe(summary.schemaFingerprint);
  expect(matchesSourcePreflightConfirmation(confirmation, next)).toBe(false);
  for (const field of ["sourceFileId", "sourceRevision", "schemaFingerprint", "snapshotFingerprint", "totalAuthoritativeRows"] as const) {
    expect(matchesSourcePreflightConfirmation({ ...confirmation, [field]: field === "totalAuthoritativeRows" ? 99 : "changed" }, summary)).toBe(false);
  }
  expect(isSourcePreflightConfirmation({ ...confirmation, snapshotFingerprint: null })).toBe(false);
  expect(isSourcePreflightConfirmation({ ...confirmation, sourceRevision: "x".repeat(513) })).toBe(false);
  expect(isSourcePreflightConfirmation({ ...confirmation, totalAuthoritativeRows: 1.5 })).toBe(false);
  expect(JSON.stringify(original)).toBe(before);
});

test("REC-BANK-263 · enlaces newest-first por cuenta sin cruzar productos, huecos ni saldos nulos", () => {
  const rows = [
    { accountExternalKey: "A", amountCents: -300, balanceAfterCents: 700 },
    { accountExternalKey: "B", amountCents: 0, balanceAfterCents: 0 },
    { accountExternalKey: "A", amountCents: 100, balanceAfterCents: 1000 },
    { accountExternalKey: "B", amountCents: -500, balanceAfterCents: 0 },
    { accountExternalKey: "A", amountCents: 0, balanceAfterCents: null },
    { accountExternalKey: "A", amountCents: 100, balanceAfterCents: 100 },
    { accountExternalKey: "A", amountCents: 100, balanceAfterCents: 50 },
  ];
  const before = JSON.stringify(rows);
  const result = summarizeSourceBalanceContinuity(rows);
  expect(result.get("A")).toEqual({ comparablePairs: 2, consistentPairs: 1, discontinuousPairs: 1, unverifiablePairs: 2 });
  expect(result.get("B")).toEqual({ comparablePairs: 1, consistentPairs: 1, discontinuousPairs: 0, unverifiablePairs: 0 });
  expect(JSON.stringify(rows)).toBe(before);
  expect(summarizeSourceBalanceContinuity([]).size).toBe(0);
});

test("REC-BANK-264 · aritmética exacta sin desbordamiento y sin certificar una fila aislada", () => {
  const result = summarizeSourceBalanceContinuity([
    { accountExternalKey: "A", amountCents: Number.MAX_SAFE_INTEGER, balanceAfterCents: Number.MAX_SAFE_INTEGER },
    { accountExternalKey: "A", amountCents: -1, balanceAfterCents: Number.MAX_SAFE_INTEGER },
    { accountExternalKey: "B", amountCents: 0, balanceAfterCents: 0 },
  ]);
  expect(result.get("A")).toEqual({ comparablePairs: 1, consistentPairs: 0, discontinuousPairs: 1, unverifiablePairs: 0 });
  expect(result.get("B")).toEqual({ comparablePairs: 0, consistentPairs: 0, discontinuousPairs: 0, unverifiablePairs: 0 });
  expect(() => summarizeSourceBalanceContinuity([{ accountExternalKey: "A", amountCents: 0.1, balanceAfterCents: 0 }])).toThrow("invalid_money");
  const summary = buildOfficialSourcePreflightSummary(snapshot());
  expect(isConfirmedSourcePreflight({ ...summary, accounts: summary.accounts.map((account, i) => i ? account : {
    ...account, balanceContinuity: { comparablePairs: 1, consistentPairs: 1, discontinuousPairs: 0, unverifiablePairs: 0 },
  }) })).toBe(false);
});

test("REC-SYNC-265 · recibo internamente coherente pero ajeno al preflight nunca acredita éxito", () => {
  const summary = buildOfficialSourcePreflightSummary(snapshot());
  const receipt = {
    status: "success", syncRunId: "synthetic-run", rowsSeen: 3, rowsInserted: 1,
    rowsRevised: 0, rowsSkipped: 2, rowsMissing: 0, duplicatesDetected: 0,
    warningsCount: 0, cursorsAdvanced: 2, sourceRevision: summary.sourceRevision,
    snapshotFingerprint: summary.snapshotFingerprint,
  };
  expect(isConfirmedSourceSyncResponse(receipt, summary)).toBe(true);
  expect(isConfirmedSourceSyncResult({ ...receipt, rowsSeen: 4, rowsSkipped: 3 })).toBe(true);
  for (const changed of [
    { rowsSeen: 4, rowsSkipped: 3 }, { cursorsAdvanced: 1 }, { sourceRevision: "another-revision" },
    { snapshotFingerprint: "0".repeat(64) }, { snapshotFingerprint: undefined },
  ]) expect(isConfirmedSourceSyncResponse({ ...receipt, ...changed }, summary)).toBe(false);
});

async function mockConfirmedSource(page: Page, options: { receiptMismatch?: boolean; conflict?: boolean; summary?: ReturnType<typeof buildOfficialSourcePreflightSummary> } = {}) {
  const summary = options.summary ?? buildOfficialSourcePreflightSummary(snapshot());
  const syncBodies: unknown[] = [];
  let statusReads = 0;
  let sourceChecks = 0;
  await page.route("**/api/source/google/status", (route) => route.fulfill({ json: {
    configured: true, authMode: "service-account", connection: {
      connected: true, accountEmail: "reader@example.invalid", sourceFileName: "Fuente sintética",
      readonly: true, managed: true, lastVerifiedAt: null,
    },
  } }));
  await page.route("**/api/health/source-runtime", (route) => route.fulfill({ json: { status: "ok", compatible: true } }));
  await page.route("**/api/source/google/preflight", (route) => {
    sourceChecks++;
    return route.fulfill({ json: summary });
  });
  await page.route("**/api/source/google/sync", (route) => {
    if (route.request().method() === "GET") {
      statusReads++;
      return route.fulfill({ json: { run: null, cursors: [] } });
    }
    syncBodies.push(route.request().postDataJSON());
    if (options.conflict) return route.fulfill({ status: 409, json: { error: "google_source_preflight_changed" } });
    return route.fulfill({ json: {
      status: "success", syncRunId: "synthetic-run", rowsSeen: 3, rowsInserted: 1,
      rowsRevised: 0, rowsSkipped: 2, rowsMissing: 0, duplicatesDetected: 0,
      warningsCount: 0, cursorsAdvanced: 2, sourceRevision: summary.sourceRevision,
      snapshotFingerprint: options.receiptMismatch ? "0".repeat(64) : summary.snapshotFingerprint,
    } });
  });
  return { summary, syncBodies, statusReads: () => statusReads, sourceChecks: () => sourceChecks };
}

test("REC-SYNC-266 · comprobar sin importar explica saldos y no ejecuta ninguna escritura", async ({ page }) => {
  const state = await mockConfirmedSource(page);
  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Comprobar sin importar" }).click();
  const report = page.getByRole("region", { name: "Prevalidación de la fuente bancaria" });
  await expect(report).toContainText("no incorpora ni modifica movimientos");
  await expect(report).toContainText("No hay pares de saldos consecutivos");
  await expect(report).toContainText("Sin saldo en origen");
  await expect(report).toContainText("no acredita por sí sola la cobertura completa");
  expect(state.syncBodies).toHaveLength(0);
  expect(state.sourceChecks()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

for (const path of ["/configuration/source", "/configuration/source/diagnostics"]) {
  test(`REC-SYNC-267 · ${path} envía confirmación exacta y no repite un recibo ajeno`, async ({ page }) => {
    const state = await mockConfirmedSource(page, { receiptMismatch: true });
    await page.goto(path);
    if (path.endsWith("diagnostics")) {
      await page.getByRole("button", { name: "Validar fuente antes de importar" }).click();
    }
    await page.getByRole("button", { name: "Actualizar desde Google" }).click();
    await expect(page.locator(".config-message.error")).toContainText(/No se puede confirmar/);
    expect(state.syncBodies).toEqual([sourcePreflightConfirmation(state.summary)]);
    expect(state.statusReads()).toBeGreaterThanOrEqual(2);
    await expect(page.locator(".config-message.success")).toHaveCount(0);
    expect(state.sourceChecks()).toBe(1);
  });
}

test("REC-SYNC-268 · cambio desde preflight exige comprobación nueva, sin falso éxito", async ({ page }) => {
  const state = await mockConfirmedSource(page, { conflict: true });
  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Actualizar desde Google" }).click();
  await expect(page.locator(".config-message.error")).toContainText("La fuente ha cambiado desde la comprobación previa");
  await expect(page.locator(".config-message.success")).toHaveCount(0);
  expect(state.syncBodies).toHaveLength(1);
  expect(state.statusReads()).toBeGreaterThanOrEqual(2);
});

test("REC-SYNC-269 · contrato limitado y comparación exacta preceden a toda persistencia", () => {
  const route = readFileSync("app/api/source/google/sync/route.ts", "utf8");
  const post = route.slice(route.indexOf("export async function POST(request: Request)"));
  const auth = post.indexOf("await requireSourceSession()");
  const read = post.indexOf("await readLimitedJsonRequest(request, 2048)");
  const match = post.indexOf("if (!matchesSourcePreflightConfirmation(confirmation, summary))");
  const sync = post.indexOf("await runtime.synchronization.synchronize(snapshot)");
  const receipt = post.indexOf("if (!isSourceSyncResultForPreflight(result, summary))");
  const verified = post.indexOf("await runtime.oauth.markVerified()");
  expect(auth).toBeGreaterThan(-1);
  expect(read).toBeGreaterThan(auth);
  expect(match).toBeGreaterThan(read);
  expect(sync).toBeGreaterThan(match);
  expect(receipt).toBeGreaterThan(sync);
  expect(verified).toBeGreaterThan(receipt);
  expect(post.slice(match, sync)).toContain("status: 409");
});

test("REC-SYNC-270 · protocolo común no escribe con preflight malformado ni repite un resultado incierto", async () => {
  const calls: string[] = [];
  let validPreflight = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("preflight")) return Response.json(validPreflight ? buildOfficialSourcePreflightSummary(snapshot()) : {});
    expect(init?.method).toBe("POST");
    throw new TypeError("synthetic connection lost after submission");
  };
  await expect(synchronizeOfficialSource({ fetcher })).rejects.toMatchObject({ code: "source_preflight_invalid", syncRequested: false });
  expect(calls).toEqual(["/api/source/google/preflight"]);
  calls.length = 0;
  validPreflight = true;
  await expect(synchronizeOfficialSource({ fetcher })).rejects.toMatchObject({ code: "google_source_sync_unconfirmed", syncRequested: true });
  expect(calls).toEqual(["/api/source/google/preflight", "/api/source/google/sync"]);
  expect(calls.filter((url) => url.endsWith("sync"))).toHaveLength(1);
});

test("REC-SYNC-271 · lector común falla de forma segura ante JSON roto, error HTTP y cancelación", async () => {
  await expect(readOfficialSourcePreflight({ fetcher: async () => new Response("not-json") }))
    .rejects.toMatchObject({ code: "source_preflight_invalid", syncRequested: false });
  await expect(readOfficialSourcePreflight({ fetcher: async () => Response.json({ error: "authentication_required" }, { status: 401 }) }))
    .rejects.toMatchObject({ code: "authentication_required", syncRequested: false });
  let writes = 0;
  const controller = new AbortController();
  controller.abort();
  await expect(synchronizeOfficialSource({ preflight: buildOfficialSourcePreflightSummary(snapshot()), signal: controller.signal,
    fetcher: async () => { writes++; return Response.json({}); },
  })).rejects.toMatchObject({ syncRequested: false });
  expect(writes).toBe(0);
});

test("REC-SYNC-272 · los cuatro puntos de sincronización usan el mismo protocolo verificado", () => {
  for (const path of ["app/inicio-overview.tsx", "app/product-preferences.tsx",
    "app/configuration/source/source-client.tsx", "app/configuration/source/source-overview-client.tsx"]) {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("synchronizeOfficialSource(");
    expect(source).not.toMatch(/fetch\("\/api\/source\/google\/sync",\s*\{\s*method:\s*"POST"/);
  }
});

test("REC-SYNC-273 · actualización automática exige confirmación real y se limita a una por sesión", async ({ page }) => {
  const state = await mockConfirmedSource(page);
  await page.addInitScript(() => localStorage.setItem("financial-app:product-preferences-v1", JSON.stringify({ syncOnOpen: true, privacyOnBlur: false })));
  await page.goto("/configuration/preferences");
  await expect(page.getByText("Última sincronización automática de esta sesión:", { exact: false })).toBeVisible();
  expect(state.syncBodies).toEqual([sourcePreflightConfirmation(state.summary)]);
  expect(state.sourceChecks()).toBe(1);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Intentar sincronizar una vez por sesión" })).toBeChecked();
  expect(state.syncBodies).toHaveLength(1);
  expect(state.sourceChecks()).toBe(1);
});

test("REC-BANK-274 · informe con discontinuidad legible en siete anchuras y ambos temas", async ({ page }, testInfo) => {
  const source = snapshot();
  const rows = [
    ["CHAIN-NEW", "04/09/2026", -3, 7],
    ["CHAIN-MIDDLE", "03/09/2026", 1, 10],
    ["CHAIN-OLD", "02/09/2026", 1, 5],
  ].map(([id, date, amount, balance]) => {
    const row: unknown[] = [...currentRow];
    row[0] = id; row[1] = date; row[13] = amount; row[14] = balance;
    return row;
  });
  // El informe visual usa una fuente físicamente válida: en la misma
  // pestaña las fechas se mantienen 04, 03, 03, 02 (no 04, 03, 02, 03).
  // La discontinuidad contable de CHAIN-OLD debe seguir siendo visible.
  source.sheets[0].rows = [rows[0], rows[1], [...prepaidRow], rows[2]];
  const preflight = buildOfficialSourcePreflightSummary(source);
  expect(preflight.cursors[0]).toMatchObject({ authoritativeRows: 4, lastSourceRowKey: "CHAIN-OLD" });
  const state = await mockConfirmedSource(page, { summary: preflight });
  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Comprobar sin importar" }).click();
  const report = page.getByRole("region", { name: "Prevalidación de la fuente bancaria" });
  await expect(report).toContainText("1 de 2 enlaces entre saldos coinciden al céntimo");
  await expect(report).toContainText("1 enlace no encadena");
  await expect(report).toContainText("no demuestra que falten movimientos");
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const width of [360, 390, 768, 1024, 1366, 1920, 2560]) {
      await page.setViewportSize({ width, height: 980 });
      await expect(report).toBeVisible();
      // ResizeObserver-driven navigation and the CSS grid can settle on
      // different frames. Require the final layout to fit; never clip it.
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      const dimensions = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return {
          width, scrollWidth: document.documentElement.scrollWidth,
          overflow: document.documentElement.scrollWidth > width,
          elements: [...document.querySelectorAll("body *")].filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.right > width + 1 && getComputedStyle(element).position !== "fixed";
          }).slice(0, 12).map((element) => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })),
        };
      });
      expect(dimensions, JSON.stringify(dimensions)).toMatchObject({ overflow: false });
      const axe = await new AxeBuilder({ page }).include('[aria-label="Prevalidación de la fuente bancaria"]').analyze();
      expect(axe.violations).toEqual([]);
      if (width === 360 || width === 1366) await report.screenshot({ path: testInfo.outputPath(`source-preflight-${theme}-${width}.png`) });
    }
  }
  expect(state.syncBodies).toHaveLength(0);
});


function expectRejectedPhysicalSource(input: OfficialSourceWorkbookSnapshot, code: SourceWorkbookContractError["code"]) {
  let failure: unknown = null;
  try {
    prepareOfficialSourceSyncBatch(input);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(SourceWorkbookContractError);
  expect((failure as SourceWorkbookContractError).code).toBe(code);
}

test("REC-SYNC-276 · IDs técnicos compartidos o vacíos no pueden fusionar cursores físicos", () => {
  const original = snapshot();
  const before = JSON.stringify(original);
  for (const badId of ["725351515", " 725351515 "]) {
    expectRejectedPhysicalSource({
      ...original,
      sheets: [original.sheets[0], { ...original.sheets[1], sourceSheetId: badId }],
    }, "duplicate_source_sheet_identity");
  }
  expectRejectedPhysicalSource({
    ...original,
    sheets: [{ ...original.sheets[0], sourceSheetId: "   " }, original.sheets[1]],
  }, "invalid_workbook_identity");
  // All failures precede a persistence call, without rewriting the fixture.
  expect(JSON.stringify(original)).toBe(before);
  expect(prepareOfficialSourceSyncBatch(original).observations).toHaveLength(3);
});

test("REC-SYNC-277 · intercalar productos en una pestaña no puede ocultar inversión cronológica", () => {
  const original = snapshot();
  // Checking and prepaid each have only one row, so a per-product-only
  // ordering check incorrectly accepted this mixed physical sheet.
  const inverted = {
    ...original,
    sheets: [
      { ...original.sheets[0], rows: [original.sheets[0].rows[1], original.sheets[0].rows[0]] },
      original.sheets[1],
    ],
  };
  expectRejectedPhysicalSource(inverted, "source_order_mismatch");
  expect(prepareOfficialSourceSyncBatch(original).observations.map((row) => row.sourceRowKey))
    .toEqual(["CC-PREFLIGHT-1", "TP-PREFLIGHT-1", "AH-PREFLIGHT-1"]);
});

test("REC-SYNC-278 · prepago archivado tampoco puede retroceder su cursor físico", () => {
  const original = snapshot();
  const olderPrepaid = [...prepaidRow];
  olderPrepaid[0] = "TP-PREFLIGHT-2";
  olderPrepaid[1] = "02/09/2026";
  const newerPrepaid = [...prepaidRow];
  newerPrepaid[0] = "TP-PREFLIGHT-3";
  newerPrepaid[1] = "05/09/2026";
  const inverted = {
    ...original,
    sheets: [
      { ...original.sheets[0], rows: [currentRow, prepaidRow, olderPrepaid, newerPrepaid] },
      original.sheets[1],
    ],
  };
  expectRejectedPhysicalSource(inverted, "source_order_mismatch");
});

test("REC-SYNC-279 · fechas coincidentes y cuentas mezcladas válidas preservan importes e identidades", () => {
  const original = snapshot();
  const sameDayPrepaid = [...prepaidRow];
  sameDayPrepaid[1] = "04/09/2026";
  const fixture = {
    ...original,
    sheets: [
      { ...original.sheets[0], rows: [currentRow, sameDayPrepaid] },
      original.sheets[1],
    ],
  };
  const before = JSON.stringify(fixture);
  const prepared = prepareOfficialSourceSyncBatch(fixture);
  const preflight = buildOfficialSourcePreflightSummary(fixture);
  expect(prepared.observations.map((row) => [row.sourceRowKey, row.bankDate, row.amountCents]))
    .toEqual([
      ["CC-PREFLIGHT-1", "2026-09-04", 100],
      ["TP-PREFLIGHT-1", "2026-09-04", -50],
      ["AH-PREFLIGHT-1", "2026-09-04", 200],
    ]);
  expect(preflight.cursors.map((cursor) => cursor.authoritativeRows)).toEqual([2, 1]);
  expect(isConfirmedSourcePreflight(preflight)).toBe(true);
  expect(JSON.stringify(fixture)).toBe(before);
});
