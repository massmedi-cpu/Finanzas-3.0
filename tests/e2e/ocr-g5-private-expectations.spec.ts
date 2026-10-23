import { expect, test } from "@playwright/test";
import {
  assertG5IndependentExpectations, matchesG5IndependentTruth,
} from "./support/g5-private-independent-expectations";
import type { DocumentOcrFinancialInterpretation } from "../../src/domain/document-ocr-financial-interpretation";

const sha = (n: number) => n.toString(16).padStart(64, "0");
const rows = Array.from({ length: 17 }, (_, i) => ({
  name: "synthetic-" + i.toString().padStart(2, "0") + ".pdf",
  sha256: sha(i + 1),
  reviewedIndependently: true as const,
  totalCents: 1245 + i, date: "2026-10-23",
  issuer: "Comercio de Prueba", taxBaseCents: 1000, taxesCents: 245,
  lineItems: [{ description: "Producto de prueba", quantity: 1,
    unitPriceCents: 1245 + i, totalCents: 1245 + i }],
}));
const files = rows.map(({name, sha256}) => ({ name, sha256 }));
const manifest = (documents: unknown) => ({ schemaVersion: 1, documents });
function actual(override: Record<string, unknown> = {}) {
  return {
    totalCents: { value: 1245 }, date: { value: "2026-10-23" },
    issuer: { value: "comercio DE prueba" }, taxBaseCents: { value: 1000 },
    taxesCents: { value: 245 },
    lines: [{ description: "producto DE   PRUEBA", quantity: 1,
      unitPriceCents: 1245, totalCents: 1245 }],
    ...override,
  } as unknown as DocumentOcrFinancialInterpretation;
}
const fails = (documents: unknown, observed = files) =>
  expect(() => assertG5IndependentExpectations(manifest(documents), observed))
    .toThrow("g5_private_independent_expectations_invalid");

test("REC-G5-340 · solo se aceptan 17 expectativas independientes con SHA y cobertura exactos", () => {
  const verified = assertG5IndependentExpectations(manifest(rows), files);
  expect(verified.size).toBe(17);
  expect(matchesG5IndependentTruth(verified.get(rows[0].name)!, actual())).toBe(true);
  fails(rows.slice(1));
  fails([...rows.slice(1), rows[1]]);
  fails(rows.map((r, i) => i === 0 ? {...r, sha256: sha(999)} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, reviewedIndependently: false} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, totalCents: 12.5} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, totalCents: null} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, date: "2026-02-30"} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, issuer: ""} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, taxesCents: 4.2} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, lineItems: null} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, lineItems: [{ ...r.lineItems[0], quantity: -1 }]} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, lineItems: [{ ...r.lineItems[0], totalCents: 12.25 }]} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, lineItems: [{ ...r.lineItems[0], description: "" }]} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, lineItems: [{ ...r.lineItems[0], privateNote: "never" }]} : r));
  fails(rows.map((r, i) => i === 0 ? {...r, bankIban: "private"} : r));
  fails(rows, files.slice(1));
  fails(rows, [...files.slice(1), {name:"unopened.pdf",sha256:sha(1)}]);
  expect(() => assertG5IndependentExpectations({
    ...manifest(rows), externalSource: "not-allowed",
  }, files)).toThrow("g5_private_independent_expectations_invalid");
});

test("REC-G5-341 · datos OCR ausentes o distintos suspenden G5, aunque el PDF se lea", () => {
  const e = assertG5IndependentExpectations(manifest(rows), files).get(rows[0].name)!;
  for (const wrong of [
    { totalCents: { value: 1244 } },
    { totalCents: { value: null } },
    { date: { value: null } },
    { date: { value: "2026-10-22" } },
    { issuer: { value: "otro comercio" } },
    { issuer: { value: null } },
    { taxesCents: { value: 244 } },
    { taxBaseCents: { value: null } },
    { lines: [] },
    { lines: [{ description: "producto diferente", quantity: 1,
      unitPriceCents: 1245, totalCents: 1245 }] },
    { lines: [{ description: "Producto de prueba", quantity: 2,
      unitPriceCents: 1245, totalCents: 1245 }] },
    { lines: [{ description: "Producto de prueba", quantity: 1,
      unitPriceCents: 1244, totalCents: 1245 }] },
    { lines: [{ description: "Producto de prueba", quantity: 1,
      unitPriceCents: 1245, totalCents: 1244 }] },
    { lines: [{ description: "Producto de prueba", quantity: 1,
      unitPriceCents: 1245, totalCents: 1245 },
      { description: "Extra", quantity: 1, unitPriceCents: 0, totalCents: 0 }] },
  ]) expect(matchesG5IndependentTruth(e, actual(wrong))).toBe(false);
  expect(matchesG5IndependentTruth(e, actual({
    issuer: { value: "  COMERCIO DE   PRUEBA " },
  }))).toBe(true);
});

test("REC-G5-342 · el corpus de pruebas nunca incorpora documentos reales ni se ejecuta en CI", () => {
  const noUnopened = assertG5IndependentExpectations(manifest(rows), files);
  expect([...noUnopened.keys()].every(k => k.startsWith("synthetic-"))).toBe(true);
});
