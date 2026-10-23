import { expect, test } from "@playwright/test";
import {
  reconcileOfficialSourcePostflight, isConfirmedSourcePostflightReport, toPublicSourcePostflightReport, SourcePostflightError,
  type SourcePostflightRow,
} from "../../src/domain/source-postflight-reconciliation";

function row(
  index: number,
  options: Partial<SourcePostflightRow> = {},
): SourcePostflightRow {
  return {
    sourceFileId: "synthetic-file-only",
    sourceSheetId: "synthetic-checking",
    sourceRowKey: "SYNTH-" + String(index).padStart(6, "0"),
    sourceFingerprint: "a".repeat(64),
    accountExternalKey: "checking",
    bankDate: "2026-10-21",
    amountCents: index * 100 - 500,
    balanceAfterCents: index === 0 ? null : index * 200,
    ...options,
  };
}

test("REC-POST-281 · la coincidencia exacta conserva nulos y no inventa saldo cero", () => {
  const source = [row(0), row(1), row(2)];
  const before = JSON.stringify(source);
  const report = reconcileOfficialSourcePostflight(source, structuredClone(source));
  expect(report).toMatchObject({
    status: "verified", scope: "supplied_snapshots_only",
    sourceRows: 3, persistedRows: 3, matchingRows: 3,
    pendingRows: 0, orphanRows: 0, differingRows: 0,
    matchingUnknownBalances: 1,
    differences: { account: 0, bankDate: 0, amountCents: 0, balanceAfterCents: 0, sourceFingerprint: 0 },
  });
  expect(JSON.stringify(source)).toBe(before);
  expect(report.accounts).toHaveLength(1);
});

test("REC-POST-282 · 3188 importados y 20 pendientes NO acreditan sincronización terminada", () => {
  const checking = Array.from({ length: 3191 }, (_, i) => row(i, {
    sourceSheetId: "synthetic-checking",
    accountExternalKey: "checking",
    balanceAfterCents: i < 134 ? null : i * 100,
  }));
  const savings = Array.from({ length: 17 }, (_, i) => row(i, {
    sourceSheetId: "synthetic-savings",
    accountExternalKey: "savings",
    balanceAfterCents: i * 100,
  }));
  const source = [...checking, ...savings];
  const stored = [...checking.slice(0, 3173), ...savings.slice(0, 15)];
  const report = reconcileOfficialSourcePostflight(source, stored);
  expect(report).toMatchObject({
    status: "pending", sourceRows: 3208, persistedRows: 3188,
    matchingRows: 3188, pendingRows: 20, orphanRows: 0,
    differingRows: 0, matchingUnknownBalances: 134,
  });
  expect(report.matchingRows + report.pendingRows + report.differingRows).toBe(report.sourceRows);
  expect(report.accounts.reduce((n, x) => n + x.pendingRows, 0)).toBe(20);
  expect(report.accounts.find(a => a.accountExternalKey === "checking")?.pendingRows).toBe(18);
  expect(report.accounts.find(a => a.accountExternalKey === "savings")?.pendingRows).toBe(2);
});

test("REC-POST-283 · distintas cuentas, fechas, importes y saldos bloquean aceptación", () => {
  const source = [row(0), row(1), row(2), row(3)];
  const stored = source.map((entry, index) => {
    if (index === 0) return { ...entry, accountExternalKey: "savings" };
    if (index === 1) return { ...entry, bankDate: "2026-10-20" };
    if (index === 2) return { ...entry, amountCents: entry.amountCents + 1 };
    return { ...entry, balanceAfterCents: null };
  });
  const report = reconcileOfficialSourcePostflight(source, stored);
  expect(report).toMatchObject({
    status: "blocked", sourceRows: 4, persistedRows: 4,
    matchingRows: 0, differingRows: 4, pendingRows: 0, orphanRows: 0,
    differences: { account: 1, bankDate: 1, amountCents: 1, balanceAfterCents: 1, sourceFingerprint: 0 },
  });
  expect(report.accounts.find(a => a.accountExternalKey === "checking")?.differingRows).toBe(4);
  expect(report.accounts.find(a => a.accountExternalKey === "savings")?.persistedRows).toBe(1);
});

test("REC-POST-284 · identidades repetidas, vacías e importes no enteros fallan sin revelar datos", () => {
  const a = row(1);
  const duplicates = [a, { ...a, sourceRowKey: "  " + a.sourceRowKey + "  " }];
  expect(() => reconcileOfficialSourcePostflight(duplicates, []))
    .toThrow(SourcePostflightError);
  expect(() => reconcileOfficialSourcePostflight(duplicates, []))
    .toThrow("source_postflight_duplicate_identity");
  expect(() => reconcileOfficialSourcePostflight([a], [a, a]))
    .toThrow("source_postflight_duplicate_identity");
  for (const invalid of [
    { sourceSheetId: "" }, { bankDate: "2026-02-30" },
    { amountCents: 0.25 }, { amountCents: Number.POSITIVE_INFINITY },
    { balanceAfterCents: Number.MAX_SAFE_INTEGER + 1 },
    { accountExternalKey: " " }, { sourceFingerprint: "not-a-valid-sha" },
  ]) {
    expect(() => reconcileOfficialSourcePostflight([{ ...a, ...invalid }], []))
      .toThrow("source_postflight_invalid_record");
  }
  expect(() => reconcileOfficialSourcePostflight(
    Array.from({ length: 10001 }, (_, i) => row(i)), [],
  )).toThrow("source_postflight_limit_exceeded");
});

test("REC-POST-285 · un huérfano o un cero inventado impiden certificación", () => {
  const source = [row(0), row(1)];
  const persisted = [{ ...row(0), balanceAfterCents: 0 }, row(1), row(9)];
  const report = reconcileOfficialSourcePostflight(source, persisted);
  expect(report).toMatchObject({
    status: "blocked", matchingRows: 1, orphanRows: 1, differingRows: 1,
    differences: { account: 0, bankDate: 0, amountCents: 0, balanceAfterCents: 1, sourceFingerprint: 0 },
  });
  const extra = reconcileOfficialSourcePostflight([], [row(9)]);
  expect(extra).toMatchObject({ status: "blocked", sourceRows: 0, orphanRows: 1 });
  expect(reconcileOfficialSourcePostflight([], [])).toMatchObject({
    status: "blocked", scope: "supplied_snapshots_only", sourceRows: 0, persistedRows: 0,
  });
});

test("REC-POST-286 · la identidad incluye archivo y pestaña, sin mezclar cuentas", () => {
  const a = row(1);
  const b = row(1, { sourceSheetId: "synthetic-savings", accountExternalKey: "savings" });
  const c = row(1, { sourceFileId: "other-synthetic-file", accountExternalKey: "savings" });
  const input = [a, b, c];
  const before = JSON.stringify(input);
  const report = reconcileOfficialSourcePostflight(input, [c, a, b]);
  expect(report).toMatchObject({ status: "verified", sourceRows: 3, matchingRows: 3 });
  expect(report.accounts.map(a => a.accountExternalKey)).toEqual(["checking", "savings"]);
  expect(JSON.stringify(input)).toBe(before);
});

test("REC-POST-287 · 10000 observaciones exactas siguen siendo deterministas", () => {
  const source = Array.from({ length: 10000 }, (_, i) => row(i, {
    amountCents: i % 2 ? -Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
    balanceAfterCents: i % 3 ? null : Number.MAX_SAFE_INTEGER,
  }));
  const first = reconcileOfficialSourcePostflight(source, source);
  const second = reconcileOfficialSourcePostflight([...source].reverse(), [...source].reverse());
  expect(first).toEqual(second);
  expect(first).toMatchObject({
    status: "verified", sourceRows: 10000, persistedRows: 10000,
    matchingRows: 10000, pendingRows: 0, orphanRows: 0, differingRows: 0,
  });
});


test("REC-POST-295 · ninguna respuesta contradictoria acredita conciliación completa", () => {
  const report = toPublicSourcePostflightReport(reconcileOfficialSourcePostflight([row(0), row(1)], [row(0)]));
  expect(report.status).toBe("pending");
  expect(isConfirmedSourcePostflightReport(report)).toBe(true);
  const mismatchedStatus = { ...report, status: "verified" };
  expect(isConfirmedSourcePostflightReport(mismatchedStatus)).toBe(false);
  expect(isConfirmedSourcePostflightReport({ ...report, sourceRows: 1 })).toBe(false);
  expect(isConfirmedSourcePostflightReport({ ...report, matchingUnknownBalances: 5 })).toBe(false);
  expect(isConfirmedSourcePostflightReport({ ...report, accounts: [
    { ...report.accounts[0], pendingRows: 0 },
  ] })).toBe(false);
  expect(isConfirmedSourcePostflightReport({ ...report, accounts: [
    report.accounts[0], report.accounts[0],
  ] })).toBe(false);
  expect(isConfirmedSourcePostflightReport({ ...report, differences: {
    ...report.differences, bankDate: 1,
  } })).toBe(false);
  expect(isConfirmedSourcePostflightReport(null)).toBe(false);
  const allExact = toPublicSourcePostflightReport(reconcileOfficialSourcePostflight([row(0)], [row(0)]));
  expect(isConfirmedSourcePostflightReport(allExact)).toBe(true);
});


test("REC-POST-296 · el informe público protege identidades de cuentas y conserva recuentos", () => {
  const secret = "Cuenta real privada · 987654";
  const source = [row(0, { accountExternalKey: secret }), row(1, { accountExternalKey: secret })];
  const internal = reconcileOfficialSourcePostflight(source, [source[0]]);
  const before = JSON.stringify(internal);
  const publicReport = toPublicSourcePostflightReport(internal);
  expect(publicReport).toMatchObject({ status: "pending", sourceRows: 2, persistedRows: 1,
    matchingRows: 1, pendingRows: 1 });
  expect(publicReport.accounts).toMatchObject([{ accountLabel: "Cuenta 1",
    sourceRows: 2, persistedRows: 1, matchingRows: 1, pendingRows: 1 }]);
  expect(JSON.stringify(publicReport)).not.toContain(secret);
  expect(JSON.stringify(publicReport)).not.toContain("accountExternalKey");
  expect(isConfirmedSourcePostflightReport(publicReport)).toBe(true);
  expect(isConfirmedSourcePostflightReport({ ...publicReport, accounts: [
    { ...publicReport.accounts[0], accountExternalKey: secret },
  ] })).toBe(false);
  expect(isConfirmedSourcePostflightReport(internal)).toBe(false);
  expect(JSON.stringify(internal)).toBe(before);
});


test("REC-POST-334 · la serialización sólo publica métricas permitidas incluso tras ampliar el objeto interno", () => {
  const privateMarker = "DIAGNOSTICO_BANCARIO_PRIVADO_NO_PUBLICAR_334";
  const original = reconcileOfficialSourcePostflight([row(0), row(1)], [row(0)]);
  const expanded = {
    ...original,
    sourceFileId: privateMarker,
    documentLocation: privateMarker,
    differences: { ...original.differences, privateDiagnostic: privateMarker },
    accounts: original.accounts.map(account => ({
      ...account, bankIban: privateMarker, sourceRowKey: privateMarker,
    })),
  };
  const before = JSON.stringify(expanded);
  const result = toPublicSourcePostflightReport(expanded);
  expect(isConfirmedSourcePostflightReport(result)).toBe(true);
  expect(JSON.stringify(result)).not.toContain(privateMarker);
  expect(Object.keys(result).sort()).toEqual([
    "status", "scope", "sourceRows", "persistedRows", "matchingRows",
    "pendingRows", "orphanRows", "differingRows", "matchingUnknownBalances",
    "differences", "accounts",
  ].sort());
  expect(Object.keys(result.differences).sort()).toEqual([
    "account", "bankDate", "amountCents", "balanceAfterCents", "sourceFingerprint",
  ].sort());
  expect(Object.keys(result.accounts[0]).sort()).toEqual([
    "accountLabel", "sourceRows", "persistedRows", "matchingRows",
    "pendingRows", "orphanRows", "differingRows",
  ].sort());
  expect(JSON.stringify(expanded)).toBe(before);
});

test("REC-POST-335 · las respuestas que agregan metadatos no permitidos fallan en cliente", () => {
  const clean = toPublicSourcePostflightReport(
    reconcileOfficialSourcePostflight([row(0), row(1)], [row(0)]),
  );
  expect(isConfirmedSourcePostflightReport(clean)).toBe(true);
  expect(isConfirmedSourcePostflightReport({
    ...clean, readConsistency: "sequential_non_atomic",
  })).toBe(true);
  expect(isConfirmedSourcePostflightReport({
    ...clean, readConsistency: "atomic",
  })).toBe(false);
  expect(isConfirmedSourcePostflightReport({
    ...clean, sourceFileId: "should-not-leak",
  })).toBe(false);
  expect(isConfirmedSourcePostflightReport({
    ...clean, differences: { ...clean.differences, sourceRowKey: "should-not-leak" },
  })).toBe(false);
  expect(isConfirmedSourcePostflightReport({
    ...clean, accounts: [{ ...clean.accounts[0], accountIban: "should-not-leak" }],
  })).toBe(false);
  expect(isConfirmedSourcePostflightReport({
    ...clean, accounts: [{ ...clean.accounts[0], importCursor: 123 }],
  })).toBe(false);
});

test("REC-POST-348 · same monetary fields but changed official source fingerprint must block", () => {
  const original = [row(1), row(2)];
  const altered = [
    { ...row(1), sourceFingerprint: "b".repeat(64) },
    row(2),
  ];
  const report = reconcileOfficialSourcePostflight(original, altered);
  expect(report).toMatchObject({
    status: "blocked", sourceRows: 2, persistedRows: 2,
    matchingRows: 1, differingRows: 1, pendingRows: 0,
    differences: { account: 0, bankDate: 0, amountCents: 0,
      balanceAfterCents: 0, sourceFingerprint: 1 },
  });
  const serialized = toPublicSourcePostflightReport(report);
  expect(isConfirmedSourcePostflightReport(serialized)).toBe(true);
  expect(JSON.stringify(serialized)).not.toContain("a".repeat(64));
  expect(JSON.stringify(serialized)).not.toContain("b".repeat(64));
  expect(isConfirmedSourcePostflightReport({
    ...serialized, differences: { ...serialized.differences, sourceFingerprint: 0 },
  })).toBe(false);
});


// REC-POST-350: totals alone cannot certify contradictory per-account evidence.
test("REC-POST-350 · reject fabricated account allocations and phantom accounts", () => {
  const a = row(10, { accountExternalKey: "synthetic-account-a" });
  const b = row(11, { accountExternalKey: "synthetic-account-b" });
  const c = row(12, { accountExternalKey: "synthetic-account-a" });
  const verified = toPublicSourcePostflightReport(
    reconcileOfficialSourcePostflight([a, b, c], [a, b, c]),
  );
  expect(isConfirmedSourcePostflightReport(verified)).toBe(true);
  expect(verified.accounts).toHaveLength(2);

  // Sum of persistedRows remains 3, yet account A falsely claims its two
  // matched rows live in account B. Previously this was accepted as verified.
  const misplaced = structuredClone(verified);
  misplaced.accounts[0].persistedRows = 0;
  misplaced.accounts[1].persistedRows = 3;
  expect(isConfirmedSourcePostflightReport(misplaced)).toBe(false);

  // A phantom zero-count account must not appear merely because its counts
  // happen to preserve every global total.
  const empty = { accountLabel: "Cuenta 3", sourceRows: 0,
    persistedRows: 0, matchingRows: 0, pendingRows: 0,
    orphanRows: 0, differingRows: 0 };
  expect(isConfirmedSourcePostflightReport({
    ...verified, accounts: [...verified.accounts, empty],
  })).toBe(false);
  expect(isConfirmedSourcePostflightReport({
    ...verified, accounts: [
      verified.accounts[0], { ...verified.accounts[1], accountLabel: "Cuenta 99" },
    ],
  })).toBe(false);

  // A genuinely changed account is still a valid BLOCKED diagnostic:
  // source-side differingRows may be accounted under its original product,
  // while the persisted row is now in a different product.
  const migrated = toPublicSourcePostflightReport(
    reconcileOfficialSourcePostflight([a], [
      { ...a, accountExternalKey: "synthetic-account-b" },
    ]),
  );
  expect(migrated.status).toBe("blocked");
  expect(isConfirmedSourcePostflightReport(migrated)).toBe(true);

  const orphan = toPublicSourcePostflightReport(
    reconcileOfficialSourcePostflight([a], [
      a, row(13, { accountExternalKey: "synthetic-account-b" }),
    ]),
  );
  expect(orphan.status).toBe("blocked");
  expect(isConfirmedSourcePostflightReport(orphan)).toBe(true);
});

// REC-POST-351: never reject a real source/persistence account mismatch merely
// because the stored account has no corresponding authoritative observations.
test("REC-POST-351 · changed persisted account remains visible as BLOCKED evidence", () => {
  const source = row(40, { accountExternalKey: "synthetic-owner-product-a" });
  const stored = { ...source, accountExternalKey: "synthetic-owner-product-b" };
  const report = reconcileOfficialSourcePostflight([source], [stored]);
  expect(report).toMatchObject({
    status: "blocked", sourceRows: 1, persistedRows: 1,
    matchingRows: 0, pendingRows: 0, orphanRows: 0, differingRows: 1,
    differences: { account: 1 },
  });
  const publicReport = toPublicSourcePostflightReport(report);
  expect(publicReport.accounts).toHaveLength(2);
  expect(isConfirmedSourcePostflightReport(publicReport)).toBe(true);
  expect(JSON.stringify(publicReport)).not.toContain("synthetic-owner-product");

  // Do not allow the additional account to become an arbitrary empty label.
  expect(isConfirmedSourcePostflightReport({
    ...publicReport, accounts: [
      publicReport.accounts[0],
      { ...publicReport.accounts[1], sourceRows: 0, persistedRows: 0 },
    ],
  })).toBe(false);
});
