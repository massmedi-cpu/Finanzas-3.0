// Synthetic financial-interpretation regression: this is NOT recognition on a real
// document, independent ground-truth corpus or an OCR precision measurement.
import assert from "node:assert/strict";
import { interpretDocumentOcrFinancially } from "../src/domain/document-ocr-financial-interpretation.ts";

function interpret(lines) {
  return interpretDocumentOcrFinancially({
    status: "ready",
    pages: [{
      pageNumber: 1,
      lines: lines.map((text, index) => ({
        id: `p1-l${index + 1}`,
        text,
        confidence: 0.98,
        alignment: "left",
        box: { x: 0.05, y: 0.1 + index * 0.05, width: 0.9, height: 0.04 },
        words: [],
      })),
    }],
  });
}

const cases = [
  {
    name: "single explicit total",
    lines: ["TOTAL 23,00"],
    field: "totalCents",
    amount: 2300,
    trust: "reliable",
  },
  {
    name: "tender and change must not displace total",
    lines: ["TOTAL 12,50 EFECTIVO 20,00 CAMBIO 7,50"],
    field: "totalCents",
    amount: 1250,
    trust: "doubtful",
  },
  {
    name: "total 4-digit comma decimal",
    lines: ["TOTAL A PAGAR 1234,56 EFECTIVO 1500,00 CAMBIO 265,44"],
    field: "totalCents",
    amount: 123456,
    trust: "doubtful",
  },
  {
    name: "explicit final total wins over earlier amount",
    lines: ["TOTAL 100,00 TOTAL A PAGAR 90,00"],
    field: "totalCents",
    amount: 9000,
    trust: "reliable",
  },
  {
    name: "amount preceding label needs review",
    lines: ["23,00 TOTAL"],
    field: "totalCents",
    amount: 2300,
    trust: "doubtful",
  },
  {
    name: "a payment-method figure alone is not a reliable total",
    lines: ["TOTAL TARJETA 50,00"],
    field: "totalCents",
    amount: 5000,
    trust: "doubtful",
  },
  {
    name: "tax amount selected from label in a shared line",
    lines: ["BASE 100,00 IVA 21,00 TOTAL 121,00"],
    field: "taxesCents",
    amount: 2100,
    trust: "doubtful",
  },
  {
    name: "total selected from label in a shared tax line",
    lines: ["BASE 100,00 IVA 21,00 TOTAL 121,00"],
    field: "totalCents",
    amount: 12100,
    trust: "reliable",
  },
  {
    name: "thousand separator kept exact in cents",
    lines: ["IMPORTE TOTAL: 1.234,56 CAMBIO 5,44"],
    field: "totalCents",
    amount: 123456,
    trust: "doubtful",
  },
  {
    name: "missing amount is not detected",
    lines: ["TOTAL NO LEGIBLE"],
    field: "totalCents",
    amount: null,
    trust: "not_detected",
  },
];

let failures = 0;
for (const sample of cases) {
  const result = interpret(sample.lines);
  const field = result[sample.field];
  try {
    assert.equal(field.value, sample.amount, `${sample.name}: amount`);
    assert.equal(field.trust, sample.trust, `${sample.name}: trust`);
    if (field.value !== null) assert.ok(field.evidence.length, `${sample.name}: original evidence retained`);
    console.log(`PASS · ${sample.name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL · ${sample.name}`, error.message);
  }
}

const taxLineCases = [
  { name: "tax line does not steal invoice total", line: "BASE 100,00 IVA 21,00 TOTAL 121,00", base: 10000, tax: 2100, rate: null, trust: "reliable" },
  { name: "tax line before total without base", line: "IVA 10,00 TOTAL 110,00", base: null, tax: 1000, rate: null, trust: "reliable" },
  { name: "explicit quota and base identify their own amounts", line: "IVA 21% BASE 100,00 CUOTA 21,00", base: 10000, tax: 2100, rate: 21, trust: "reliable" },
  { name: "unlabelled amounts require review", line: "IVA 21% 100,00 21,00", base: 10000, tax: 2100, rate: 21, trust: "doubtful" },
  { name: "invoice total is not tax when tax line has no amount", line: "IVA 21% TOTAL 121,00", base: null, tax: null, rate: 21, trust: "doubtful" },
  { name: "tax percentage alone is not an amount", line: "IVA 21%", base: null, tax: null, rate: 21, trust: "doubtful" },
  { name: "change is never taken as a tax", line: "IVA 21% 100,00 21,00 CAMBIO 20,00", base: 10000, tax: 2100, rate: 21, trust: "doubtful" },
];
for (const sample of taxLineCases) {
  const row = interpret([sample.line]).taxLines[0];
  try {
    assert.ok(row, sample.name + ": tax row exists");
    assert.equal(row.baseCents, sample.base, sample.name + ": base");
    assert.equal(row.taxCents, sample.tax, sample.name + ": tax");
    assert.equal(row.ratePercent, sample.rate, sample.name + ": rate");
    assert.equal(row.trust, sample.trust, sample.name + ": trust");
    assert.equal(row.evidence[0].rawText, sample.line, sample.name + ": original evidence");
    console.log("PASS · " + sample.name);
  } catch (error) {
    failures++;
    console.error("FAIL · " + sample.name, error.message);
  }
}

console.log(`OCR label selection, synthetic interpretation only: ${cases.length + taxLineCases.length - failures}/${cases.length + taxLineCases.length} PASS`);
if (failures) process.exitCode = 1;
