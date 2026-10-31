import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { assertG5HoldoutFreeze } from "./support/g5-private-holdout-freeze";
import {
  assertG5HoldoutExpectations, matchesG5IndependentTruth,
} from "./support/g5-private-independent-expectations";
import type { DocumentOcrFinancialInterpretation } from "../../src/domain/document-ocr-financial-interpretation";

const head = "a".repeat(40);
const inspected = {
  schemaVersion: 1,
  documents: Array.from({ length: 17 }, (_, i) => ({
    name: "opened-synthetic-" + i + ".pdf",
    sha256: (i + 1).toString(16).padStart(64, "0"),
    previouslyInspected: true,
  })),
};
const names = Array.from({ length: 8 }, (_, i) => "sealed-synthetic-" + i + ".pdf");
const freeze = {
  schemaVersion: 1, frozenCommit: head,
  selectedDocuments: names.map(name => ({ name, previouslyInspectedBeforeFreeze: false })),
};
const gold = {
  schemaVersion: 1,
  documents: names.map((name, i) => ({
    name, sha256: (i + 100).toString(16).padStart(64, "0"),
    reviewedIndependently: true,
    totalCents: 1245 + i, date: "2026-10-23", issuer: "Emisor de prueba",
    taxBaseCents: 1000, taxesCents: 245,
    lineItems: [{ description: "Servicio de prueba", quantity: 1,
      unitPriceCents: 1245 + i, totalCents: 1245 + i }],
  })),
};
const observed = gold.documents.map(({ name, sha256 }) => ({ name, sha256 }));
const invalidFreeze = (f: unknown, h: unknown = inspected, inventory = names, sha = head) =>
  expect(() => assertG5HoldoutFreeze(f, h, inventory, sha))
    .toThrow("g5_holdout_freeze_invalid");

test("REC-G5-345 · freeze antes de abrir un holdout, sin solapar los diecisiete originales", () => {
  expect(assertG5HoldoutFreeze(freeze, inspected, names, head).selectedDocuments).toHaveLength(8);
  invalidFreeze({ ...freeze, frozenCommit: "b".repeat(40) });
  invalidFreeze(freeze, inspected, names, "b".repeat(40));
  invalidFreeze({ ...freeze, selectedDocuments: freeze.selectedDocuments.slice(1) });
  invalidFreeze({ ...freeze, selectedDocuments: [
    ...freeze.selectedDocuments.slice(1), freeze.selectedDocuments[1],
  ] });
  invalidFreeze({ ...freeze, selectedDocuments: freeze.selectedDocuments.map((x, i) =>
    i ? x : { ...x, previouslyInspectedBeforeFreeze: true }) });
  invalidFreeze({ ...freeze, selectedDocuments: freeze.selectedDocuments.map((x, i) =>
    i ? x : { ...x, name: "opened-synthetic-0.pdf" }) });
  invalidFreeze({ ...freeze, selectedDocuments: freeze.selectedDocuments.map((x, i) =>
    i ? x : { ...x, name: "../private.pdf" }) });
  invalidFreeze({ ...freeze, unsignedExtra: "never" });
  invalidFreeze(freeze, inspected, [...names.slice(1), names[1]]);
  invalidFreeze(freeze, { ...inspected, documents: inspected.documents.map((x, i) =>
    i ? x : { ...x, previouslyInspected: false }) });
  invalidFreeze(freeze, { ...inspected, documents: inspected.documents.slice(1) });
});

test("REC-G5-346 · 8 expectativas GOLD independientes y detalle de línea sin tolerancias ocultas", () => {
  const verified = assertG5HoldoutExpectations(gold, observed);
  expect(verified.size).toBe(8);
  for (const wrong of [
    { schemaVersion: 1, documents: gold.documents.slice(1) },
    { schemaVersion: 1, documents: [...gold.documents.slice(1), gold.documents[1]] },
    { schemaVersion: 1, documents: gold.documents.map((x, i) =>
      i ? x : { ...x, sha256: "f".repeat(64) }) },
    { schemaVersion: 1, documents: gold.documents.map((x, i) =>
      i ? x : { ...x, reviewedIndependently: false }) },
    { schemaVersion: 1, documents: gold.documents.map((x, i) =>
      i ? x : { ...x, totalCents: 12.45 }) },
    { schemaVersion: 1, documents: gold.documents.map((x, i) =>
      i ? x : { ...x, lineItems: [{ ...x.lineItems[0], totalCents: 12.45 }] }) },
  ]) expect(() => assertG5HoldoutExpectations(wrong, observed))
    .toThrow("g5_private_independent_expectations_invalid");

  const extracted = {
    totalCents: { value: 1245 }, date: { value: "2026-10-23" },
    issuer: { value: "emisor DE PRUEBA" }, taxBaseCents: { value: 1000 },
    taxesCents: { value: 245 }, lines: [{ description: "servicio de prueba",
      quantity: 1, unitPriceCents: 1245, totalCents: 1245 }],
  } as unknown as DocumentOcrFinancialInterpretation;
  expect(matchesG5IndependentTruth(verified.get(names[0])!, extracted)).toBe(true);
  expect(matchesG5IndependentTruth(verified.get(names[0])!, {
    ...extracted, lines: [{ ...extracted.lines[0], totalCents: 1244 }],
  })).toBe(false);
  expect(matchesG5IndependentTruth(verified.get(names[0])!, {
    ...extracted, taxesCents: { value: 244 },
  })).toBe(false);
});

test("REC-G5-348 · validar GOLD completo antes de leer los ocho PDF", () => {
  const local = readFileSync("tests/e2e/ocr-g5-private-holdout-local.spec.ts", "utf8");
  const freeze = local.indexOf("assertG5HoldoutFreeze(privateJson(FREEZE)");
  const manifest = local.indexOf("const manifest = privateJson(TRUTH)");
  const declared = local.indexOf("const declared = ");
  const precheck = local.indexOf("assertG5HoldoutExpectations(manifest, declared)");
  const firstRead = local.indexOf("const bytes = readFileSync(full)");
  const observedCheck = local.lastIndexOf("assertG5HoldoutExpectations(manifest,");
  expect(freeze).toBeGreaterThan(0);
  expect(manifest).toBeGreaterThan(freeze);
  expect(declared).toBeGreaterThan(manifest);
  expect(precheck).toBeGreaterThan(declared);
  expect(firstRead).toBeGreaterThan(precheck);
  expect(observedCheck).toBeGreaterThan(firstRead);
  expect(local).toContain("documents.map(({ name, sha256 }) => ({ name, sha256 }))");
  expect(local).not.toMatch(/\b(?:fetch\s*\(|axios\b|writeFileSync\b|uploadFile\b)/);
});

test("REC-G5-347 · prueba local excluida de CI pública y sin red ni salida privada", () => {
  const local = readFileSync("tests/e2e/ocr-g5-private-holdout-local.spec.ts", "utf8");
  const workflow = readFileSync(".github/workflows/product-recovery-ui.yml", "utf8");
  for (const term of [
    "process.env.GITHUB_ACTIONS === \"true\"",
    "assertG5HoldoutFreeze(", "assertG5HoldoutExpectations(",
    "matchesG5IndependentTruth(", "execFileSync(\"git\"",
    "holdout_opened_after_freeze=true",
    "names_logged=false", "amounts_logged=false", "financial_writes=false",
  ]) expect(local).toContain(term);
  expect(local).not.toMatch(/\b(?:fetch\s*\(|axios|writeFileSync|uploadFile)\b/);
  expect(workflow).toContain("tests/e2e/ocr-g5-private-holdout-contract.spec.ts");
  expect(workflow).not.toContain("          tests/e2e/ocr-g5-private-holdout-local.spec.ts");
});
