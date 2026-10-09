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
console.log(`OCR label selection, synthetic interpretation only: ${cases.length - failures}/${cases.length} PASS`);
if (failures) process.exitCode = 1;
