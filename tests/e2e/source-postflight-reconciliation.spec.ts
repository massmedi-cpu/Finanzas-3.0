import { expect, test } from "@playwright/test";
import {
  reconcileOfficialSourcePostflight, SourcePostflightError,
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
    differences: { account: 0, bankDate: 0, amountCents: 0, balanceAfterCents: 0 },
  });
  expect(JSON.stringify(source)).toBe(before);
  expect(report.accounts).toHaveLength(1);
});

test("REC-POST-282 · 3188 importados y 20 pendientes NO acreditan sincronización terminada", () => {
  const source = Array.from({ length: 3208 }, (_, i) => row(i, {
    sourceSheetId: i % 1604 < 1595 ? "synthetic-checking" : "synthetic-savings",
    accountExternalKey: i % 1604 < 1595 ? "checking" : "savings",
    balanceAfterCents: i < 134 ? null : i * 100,
  }));
  const stored = source.slice(0, 3188);
  const report = reconcileOfficialSourcePostflight(source, stored);
  expect(report).toMatchObject({
    status: "pending", sourceRows: 3208, persistedRows: 3188,
    matchingRows: 3188, pendingRows: 20, orphanRows: 0,
    differingRows: 0, matchingUnknownBalances: 134,
  });
  expect(report.matchingRows + report.pendingRows + report.differingRows).toBe(report.sourceRows);
  expect(report.accounts.reduce((n, x) => n + x.pendingRows, 0)).toBe(20);
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
    differences: { account: 1, bankDate: 1, amountCents: 1, balanceAfterCents: 1 },
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
    { accountExternalKey: " " },
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
    differences: { account: 0, bankDate: 0, amountCents: 0, balanceAfterCents: 1 },
  });
  const extra = reconcileOfficialSourcePostflight([], [row(9)]);
  expect(extra).toMatchObject({ status: "blocked", sourceRows: 0, orphanRows: 1 });
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
