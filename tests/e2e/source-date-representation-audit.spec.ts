import { expect, test } from "@playwright/test";
import {
  auditOfficialSourceDateRepresentations, SourceDateRepresentationAuditError,
  prepareVerifiedAppendOnlySourcePlan, verifyPlannedAppendOnlyPostflight,
} from "../../src/application/source-date-representation-audit";
import { buildSourcePostflightReport } from "../../src/application/source-postflight-report";
import { isSafeAppendOnlySourceBaseline } from "../../src/application/source-sync-postflight-policy";
import {
  prepareOfficialSourceSyncBatch, type OfficialSourceWorkbookSnapshot,
} from "../../src/application/source-sync-service";
import { OFFICIAL_BANK_SOURCE_HEADERS, type SourceCellValue } from "../../src/domain/official-bank-source";

const SERIAL = (Date.UTC(2026, 9, 21) - Date.UTC(1899, 11, 30)) / 86_400_000;

function row(key: string, savings = false): SourceCellValue[] {
  return [
    key, "21/10/2026", null,
    savings ? "Cuenta ahorro Openbank · 2504" : "Cuenta corriente Openbank · 3967",
    "Openbank", savings ? "****2504" : "****3967", "Cuenta bancaria", "Ingreso",
    null, null, "MARCADOR_SINTETICO_PRIVADO", "PRUEBA", null,
    1.25, 10, null, null, null, "No", "No", null, "Fuente sintética",
  ];
}

function source(): OfficialSourceWorkbookSnapshot {
  return {
    sourceFileId: "synthetic-date-audit-book", sourceRevision: "synthetic-date-audit-revision",
    sheets: [
      { sourceSheetId: "725351515", title: "Cuenta corriente · 3967", headers: OFFICIAL_BANK_SOURCE_HEADERS,
        rows: [row("SYN-CC-1"), row("SYN-CC-2")] },
      { sourceSheetId: "2504001", title: "Cuenta ahorro · 2504", headers: OFFICIAL_BANK_SOURCE_HEADERS,
        rows: [row("SYN-AH-1", true), row("SYN-AH-2", true)] },
    ],
  };
}

function replaceCell(snapshot: OfficialSourceWorkbookSnapshot, column: number, value: unknown) {
  return { ...snapshot, sheets: snapshot.sheets.map((sheet, index) => index ? sheet : {
    ...sheet, rows: sheet.rows.map((values, rowIndex) => rowIndex ? values
      : values.map((cell, colIndex) => colIndex === column ? value : cell)),
  }) };
}

function stored(snapshot: OfficialSourceWorkbookSnapshot) {
  const batch = prepareOfficialSourceSyncBatch(snapshot);
  return { rows: batch.observations.map(item => ({
    source_file_id: batch.sourceFileId, source_sheet_id: item.sourceSheetId,
    source_row_key: item.sourceRowKey, source_row_identity: item.sourceRowIdentity,
    source_fingerprint: item.sourceFingerprint, source_payload: { ...item.sourcePayload },
    concept_original: item.conceptOriginal, account_external_key: item.accountExternalKey,
    bank_date: item.bankDate, amount_cents: String(item.amountCents),
    balance_after_cents: item.balanceAfterCents === null ? null : String(item.balanceAfterCents),
  })) };
}

function expectRejectedBaseline(snapshot: OfficialSourceWorkbookSnapshot, previous: unknown) {
  let classification: string;
  try {
    classification = auditOfficialSourceDateRepresentations(snapshot, previous).baselineClassification;
  } catch (error) {
    expect(error).toBeInstanceOf(SourceDateRepresentationAuditError);
    classification = "invalid";
  }
  expect(["blocked", "invalid"]).toContain(classification);
}

test("REC-SYNC-387 · date-only proof recomputes both hashes, keeps originals and publishes only counts", () => {
  const original = replaceCell(source(), 14, null);
  const current = replaceCell(original, 1, SERIAL);
  const previous = stored(original);
  const before = JSON.stringify({ original, current, previous });
  expect(auditOfficialSourceDateRepresentations(current, previous)).toEqual({
    scope: "supplied_snapshots_only", baselineClassification: "date_representation_only",
    sourceRows: 4, persistedRows: 4, exactRows: 3, dateRepresentationRows: 1,
    changedRows: 0, pendingRows: 0, orphanRows: 0,
  });
  expect(auditOfficialSourceDateRepresentations(original, previous)).toMatchObject({
    baselineClassification: "exact", exactRows: 4, dateRepresentationRows: 0,
  });
  expect(JSON.stringify({ original, current, previous })).toBe(before);
  const output = JSON.stringify(auditOfficialSourceDateRepresentations(current, previous));
  for (const privateValue of ["MARCADOR_SINTETICO_PRIVADO", "SYN-CC-1", "synthetic-date-audit-book",
    "Cuenta corriente", "source_payload", previous.rows[0].source_fingerprint]) {
    expect(output).not.toContain(privateValue);
  }
});

for (const [column, header] of OFFICIAL_BANK_SOURCE_HEADERS.entries()) {
  if (header === "Fecha") continue;
  test(`REC-SYNC-388 · a change in ${header} cannot be excused by the date representation`, () => {
    const original = source();
    const value = original.sheets[0].rows[0][column];
    const mutation = typeof value === "number" ? value + 1 : value === null ? "CAMBIADO"
      : value === "No" ? "Sí" : String(value) + " CAMBIADO";
    const current = replaceCell(replaceCell(original, 1, SERIAL), column, mutation);
    expectRejectedBaseline(current, stored(original));
  });
}

test("REC-SYNC-389 · no text, number, boolean, blank, whitespace or unknown-balance coercions", () => {
  for (const [column, initial, changed] of [
    [20, "100", 100], [20, null, false], [20, false, null],
    [20, "nota", "nota "], [20, null, " "], [13, 1.25, "1.25"], [14, null, 0],
  ] as const) {
    const original = replaceCell(source(), column, initial);
    const current = replaceCell(replaceCell(original, 1, SERIAL), column, changed);
    expectRejectedBaseline(current, stored(original));
  }
});

test("REC-SYNC-390 · the exception has one direction and one exact same-day date format", () => {
  const original = source();
  for (const otherDate of [SERIAL + 1, "2026-10-21", "21/10/2026 ", "2026-10-21T00:00:00Z", SERIAL + 0.5]) {
    expectRejectedBaseline(replaceCell(original, 1, otherDate), stored(original));
  }
  const previousIso = replaceCell(original, 1, "2026-10-21");
  expectRejectedBaseline(replaceCell(original, 1, SERIAL), stored(previousIso));
  const previousSerial = replaceCell(original, 1, SERIAL);
  expectRejectedBaseline(original, stored(previousSerial));
  const invalidDay = stored(original);
  invalidDay.rows[0].source_payload.Fecha = "31/02/2026";
  expectRejectedBaseline(replaceCell(original, 1, SERIAL), invalidDay);
});

test("REC-SYNC-391 · forged fingerprints or independent persisted metadata cannot obtain a proof", () => {
  const current = replaceCell(source(), 1, SERIAL);
  const previous = stored(source());
  const changes = [
    { source_fingerprint: "b".repeat(64) }, { source_row_key: "OTHER" },
    { source_row_identity: "forged" }, { source_sheet_id: "other-sheet" },
    { source_file_id: "other-file" }, { concept_original: "MODIFICADO" },
    { bank_date: "2026-10-20" }, { amount_cents: "126" },
    { balance_after_cents: null }, { account_external_key: "other-account" },
  ];
  for (const change of changes) {
    const forged = { rows: previous.rows.map((item, index) => index ? item : { ...item, ...change }) };
    expect(() => auditOfficialSourceDateRepresentations(current, forged))
      .toThrow("source_date_representation_audit_invalid_snapshot");
  }
  const duplicate = { rows: [...previous.rows, previous.rows[0]] };
  expectRejectedBaseline(current, duplicate);
});

test("REC-SYNC-392 · strict row/payload completeness and sanitized failures survive malformed input", () => {
  const snapshot = source();
  const previous = stored(snapshot);
  const missingCell = structuredClone(previous);
  delete missingCell.rows[0].source_payload.Notas;
  const missingMetadata = { ...previous.rows[0] } as Record<string, unknown>;
  delete missingMetadata.source_fingerprint;
  for (const bad of [
    null, [], { rows: previous.rows, complete: true }, { rows: previous.rows, nextCursor: null },
    { rows: [missingMetadata] }, missingCell,
    { rows: [{ ...previous.rows[0], source_payload: { ...previous.rows[0].source_payload, EXTRA: null } }] },
    { rows: [{ ...previous.rows[0], source_payload: { ...previous.rows[0].source_payload, Notas: { private: true } } }] },
    { rows: [{ ...previous.rows[0], source_payload: { ...previous.rows[0].source_payload, Notas: NaN } }] },
    { rows: new Array(10_001).fill(previous.rows[0]) },
  ]) {
    let caught: unknown;
    try { auditOfficialSourceDateRepresentations(snapshot, bad); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(SourceDateRepresentationAuditError);
    expect((caught as Error).message).toBe("source_date_representation_audit_invalid_snapshot");
    expect((caught as Error).cause).toBeUndefined();
    expect(JSON.stringify(caught)).not.toContain("MARCADOR_SINTETICO_PRIVADO");
  }
  const duplicateSource = { ...snapshot, sheets: snapshot.sheets.map((sheet, index) => index ? sheet : {
    ...sheet, rows: [...sheet.rows, sheet.rows[0]],
  }) };
  expectRejectedBaseline(duplicateSource, previous);
});

test("REC-SYNC-393 · 3208/3188 with one representational date still leaves 20 pending and strict sync blocked", () => {
  const base = source();
  const full = { ...base, sheets: base.sheets.map((sheet, index) => ({
    ...sheet, rows: Array.from({ length: index ? 17 : 3191 }, (_, n) => row(`SYN-${index}-${n}`, !!index)),
  })) };
  const previous = stored(full);
  previous.rows = previous.rows.filter(item => item.source_sheet_id === "725351515"
    ? Number(item.source_row_key.split("-").at(-1)) < 3173
    : Number(item.source_row_key.split("-").at(-1)) < 15);
  const current = replaceCell(full, 1, SERIAL);
  expect(auditOfficialSourceDateRepresentations(current, previous)).toEqual({
    scope: "supplied_snapshots_only", baselineClassification: "date_representation_only",
    sourceRows: 3208, persistedRows: 3188, exactRows: 3187, dateRepresentationRows: 1,
    changedRows: 0, pendingRows: 20, orphanRows: 0,
  });
  // The new diagnostic must NOT turn the existing eight-column hash gate green.
  const strict = buildSourcePostflightReport(current, { rows: previous.rows.map(item => {
    const { source_payload, source_row_identity, concept_original, ...metadata } = item;
    return metadata;
  }) });
  expect(strict).toMatchObject({ status: "blocked", differingRows: 1, pendingRows: 20,
    differences: { sourceFingerprint: 1 } });
  expect(isSafeAppendOnlySourceBaseline(strict)).toBe(false);
});

test("REC-SYNC-394 · orphaned originals and empty history remain blocked; input order cannot alter counts", () => {
  const previous = stored(source());
  const withoutLast = { ...source(), sheets: source().sheets.map((sheet, index) => index ? sheet
    : { ...sheet, rows: sheet.rows.slice(0, 1) }) };
  expect(auditOfficialSourceDateRepresentations(withoutLast, previous)).toMatchObject({
    baselineClassification: "blocked", orphanRows: 1, exactRows: 3,
  });
  expect(auditOfficialSourceDateRepresentations(source(), { rows: [] })).toMatchObject({
    baselineClassification: "blocked", pendingRows: 4,
  });
  expect(auditOfficialSourceDateRepresentations(source(), { rows: [...previous.rows].reverse() }))
    .toEqual(auditOfficialSourceDateRepresentations(source(), previous));
});


test("REC-SYNC-400 · canonical append-only plan keeps historical byte-level source payload and permits new rows", () => {
  const original = source();
  const base = stored(original);
  const google = replaceCell(original, 1, SERIAL);
  const incoming = { ...google, sheets: google.sheets.map((sheet, index) => index ? sheet : {
    ...sheet, rows: [row("SYN-CC-NEW"), ...sheet.rows],
  }) };
  const originalBytes = JSON.stringify({ original, base, incoming });
  const plan = prepareVerifiedAppendOnlySourcePlan(incoming, base);
  expect(plan.audit).toMatchObject({
    baselineClassification: "date_representation_only",
    sourceRows: 5, persistedRows: 4, exactRows: 3,
    dateRepresentationRows: 1, pendingRows: 1, changedRows: 0, orphanRows: 0,
  });
  expect(plan.preservedRepresentationRows).toBe(1);
  const historical = plan.batch.observations.find(item => item.sourceRowKey === "SYN-CC-1");
  const persistedHistorical = base.rows.find(item => item.source_row_key === "SYN-CC-1")!;
  expect(historical?.sourceFingerprint).toBe(persistedHistorical.source_fingerprint);
  expect(historical?.sourcePayload).toEqual(persistedHistorical.source_payload);
  expect(historical?.sourcePayload.Fecha).toBe("21/10/2026");
  expect(plan.batch.observations.find(item => item.sourceRowKey === "SYN-CC-NEW")?.sourcePayload.Fecha)
    .toBe("21/10/2026");
  expect(JSON.stringify({ original, base, incoming })).toBe(originalBytes);
});

test("REC-SYNC-401 · strict canonical postflight proves all rows and rejects revision, truncation, and extra fields", () => {
  const sourceGoogle = replaceCell(source(), 1, SERIAL);
  const original = stored(source());
  const plan = prepareVerifiedAppendOnlySourcePlan(sourceGoogle, original);
  const expected = { rows: plan.batch.observations.map(item => ({
    source_file_id: plan.batch.sourceFileId,
    source_sheet_id: item.sourceSheetId, source_row_key: item.sourceRowKey,
    source_fingerprint: item.sourceFingerprint, account_external_key: item.accountExternalKey,
    bank_date: item.bankDate, amount_cents: String(item.amountCents),
    balance_after_cents: item.balanceAfterCents === null ? null : String(item.balanceAfterCents),
  })) };
  expect(verifyPlannedAppendOnlyPostflight(plan, expected)).toMatchObject({
    status: "verified", sourceRows: 4, persistedRows: 4, matchingRows: 4,
    differingRows: 0, orphanRows: 0, pendingRows: 0,
  });
  expect(verifyPlannedAppendOnlyPostflight(plan, { rows: expected.rows.slice(1) })).toMatchObject({
    status: "pending", pendingRows: 1,
  });
  expect(verifyPlannedAppendOnlyPostflight(plan, {
    rows: expected.rows.map((item, index) => index ? item : { ...item, source_fingerprint: "f".repeat(64) }),
  })).toMatchObject({ status: "blocked", differingRows: 1 });
  expect(() => verifyPlannedAppendOnlyPostflight(plan, { ...expected, hasMore: false }))
    .toThrow("source_postflight_invalid_record");
});

test("REC-SYNC-402 · unexpected historical edits or an orphan fail closed before constructing any import plan", () => {
  const original = source();
  const previous = stored(original);
  const changed = replaceCell(replaceCell(original, 1, SERIAL), 10, "ALTERACION");
  expect(() => prepareVerifiedAppendOnlySourcePlan(changed, previous))
    .toThrow("source_date_representation_audit_invalid_snapshot");
  expect(() => prepareVerifiedAppendOnlySourcePlan(original, { rows: [ ...previous.rows,
    { ...previous.rows[0], source_row_key: "ORPHAN", source_row_identity: "forged" },
  ] })).toThrow("source_date_representation_audit_invalid_snapshot");
  expect(() => prepareVerifiedAppendOnlySourcePlan(original, { rows: [] }))
    .toThrow("source_date_representation_audit_invalid_snapshot");
});

test("REC-SYNC-403 · 3208/3188 synthetic reconciliation keeps 3188 immutable payloads and all 20 append candidates", () => {
  const base = source();
  const full = { ...base, sheets: base.sheets.map((sheet, index) => ({
    ...sheet, rows: Array.from({ length: index ? 17 : 3191 }, (_, n) => row(`SYN-${index}-${n}`, !!index)),
  })) };
  const previous = stored(full);
  previous.rows = previous.rows.filter(item => item.source_sheet_id === "725351515"
    ? Number(item.source_row_key.split("-").at(-1)) < 3173
    : Number(item.source_row_key.split("-").at(-1)) < 15);
  const current = replaceCell(full, 1, SERIAL);
  const plan = prepareVerifiedAppendOnlySourcePlan(current, previous);
  expect(plan.audit).toMatchObject({
    sourceRows: 3208, persistedRows: 3188, exactRows: 3187,
    dateRepresentationRows: 1, pendingRows: 20, orphanRows: 0, changedRows: 0,
  });
  const prior = new Map(previous.rows.map(item => [item.source_row_identity, item]));
  const newOnes = plan.batch.observations.filter(item => !prior.has(item.sourceRowIdentity));
  expect(newOnes).toHaveLength(20);
  for (const entry of plan.batch.observations) {
    const old = prior.get(entry.sourceRowIdentity);
    if (!old) continue;
    expect(entry.sourceFingerprint).toBe(old.source_fingerprint);
    expect(entry.sourcePayload).toEqual(old.source_payload);
  }
  expect(plan.preservedRepresentationRows).toBe(1);
});

test("REC-SYNC-404 · private original reads are production-only and workspace-scoped", () => {
  const edge = readFileSync("supabase/functions/financial-app-db-gateway/source-sync.ts", "utf8");
  const index = readFileSync("supabase/functions/financial-app-db-gateway/index.ts", "utf8");
  const start = edge.indexOf('if (action === "source.original_rows")');
  const end = edge.indexOf('if (action === "source.postflight_rows")', start);
  const sourceBlock = edge.slice(start, end);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  expect(sourceBlock).toContain('environment !== "production"');
  expect(sourceBlock).toContain("financial_app.workspace_id");
  expect(sourceBlock).toContain("source_file_id=${payload.sourceFileId}");
  expect(sourceBlock).toContain("workspace_id=${workspace[0].workspace_id}::uuid");
  expect(sourceBlock).toContain("limit 10001");
  expect(sourceBlock).toContain("source_payload,concept_original");
  expect(sourceBlock).not.toMatch(/insert into|update financial_app|delete from/i);
  const previewAllowlist = index.slice(
    index.indexOf("const PREVIEW_READ_ONLY_ACTIONS"), index.indexOf("function isPreviewProductionAccessAllowed"),
  );
  expect(previewAllowlist).not.toContain('"source.original_rows"');
});
