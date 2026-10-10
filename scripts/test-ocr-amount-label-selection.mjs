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
    name: "line-separated total retains amount but requires human review",
    lines: ["TOTAL A PAGAR", "23,45 €"],
    field: "totalCents",
    amount: 2345,
    trust: "doubtful",
    evidenceLines: ["TOTAL A PAGAR", "23,45 €"],
  },
  {
    name: "line-separated invoice amount retains value but requires review",
    lines: ["IMPORTE DE LA FACTURA:", "1.234,56 €"],
    field: "totalCents",
    amount: 123456,
    trust: "doubtful",
    evidenceLines: ["IMPORTE DE LA FACTURA:", "1.234,56 €"],
  },
  {
    name: "a bare total cannot steal cash received from next line",
    lines: ["TOTAL", "EFECTIVO 50,00"],
    field: "totalCents",
    amount: null,
    trust: "not_detected",
  },
  {
    name: "a bare total cannot steal two competing adjacent amounts",
    lines: ["TOTAL", "12,34 14,00"],
    field: "totalCents",
    amount: null,
    trust: "not_detected",
  },
  {
    name: "an illegible total cannot borrow a following amount",
    lines: ["TOTAL NO LEGIBLE", "12,34"],
    field: "totalCents",
    amount: null,
    trust: "not_detected",
  },
  {
    name: "three-decimal amount following total is not truncated",
    lines: ["TOTAL", "1,234"],
    field: "totalCents",
    amount: null,
    trust: "not_detected",
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
  {
    name: "invoice amount label without TOTAL is a valid total",
    lines: ["IMPORTE FACTURA: 43,21 €"],
    field: "totalCents",
    amount: 4321,
    trust: "reliable",
  },
  {
    name: "invoice amount label with de la is recognized",
    lines: ["IMPORTE DE LA FACTURA 31,07 €"],
    field: "totalCents",
    amount: 3107,
    trust: "reliable",
  },
  {
    name: "total importe factura label is recognized",
    lines: ["TOTAL IMPORTE FACTURA 82,39 €"],
    field: "totalCents",
    amount: 8239,
    trust: "reliable",
  },
  {
    name: "contradictory invoice header and footer require review",
    lines: ["IMPORTE FACTURA: 43,21 €", "TOTAL IMPORTE FACTURA 42,21 €"],
    field: "totalCents",
    amount: 4321,
    trust: "doubtful",
  },
  {
    name: "three decimal quantity is not a euro total",
    lines: ["TOTAL 1,234"],
    field: "totalCents",
    amount: null,
    trust: "not_detected",
  },
  {
    name: "grouped amount with three decimal digits is not truncated",
    lines: ["TOTAL 1.234,567"],
    field: "totalCents",
    amount: null,
    trust: "not_detected",
  },
  {
    name: "full two decimal amount before sentence punctuation remains valid",
    lines: ["TOTAL 12,34."],
    field: "totalCents",
    amount: 1234,
    trust: "reliable",
  },
  {
    name: "Unicode mathematical minus keeps negative refund sign",
    lines: ["TOTAL −12,34"],
    field: "totalCents",
    amount: -1234,
    trust: "reliable",
  },
  {
    name: "En dash refund sign is not silently dropped",
    lines: ["TOTAL –12,34"],
    field: "totalCents",
    amount: -1234,
    trust: "reliable",
  },
  {
    name: "grouped two decimal amount remains valid before punctuation",
    lines: ["TOTAL 1.234,56."],
    field: "totalCents",
    amount: 123456,
    trust: "reliable",
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
    if (sample.evidenceLines) assert.deepEqual(
      field.evidence.map((entry) => entry.rawText),
      sample.evidenceLines,
      `${sample.name}: both original OCR lines remain attached`,
    );
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
// The base has three decimal digits (possibly weight), so the OCR parser
// must not interpret its "1,23" prefix as a taxable amount.
taxLineCases.push({
  name: "three decimal base cannot be silently truncated to cents",
  line: "IVA 21% BASE 1,234 CUOTA 2,10",
  base: null,
  tax: 210,
  rate: 21,
  trust: "reliable",
});
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

const taxTableCases = [
  {
    name: "two IVA rates under a separated Base/Cuota header",
    lines: [
      "IVA BASE IMPONIBLE (€) CUOTA (€)",
      "10% 30,00 3,00",
      "21 % 10,00 2,10",
      "TOTAL 45,10",
    ],
    expected: [[10, 3000, 300], [21, 1000, 210]],
  },
  {
    name: "a malformed three-decimal tax base is not interpreted as cents",
    lines: ["IVA BASE IMPONIBLE (€) CUOTA (€)", "10% 30,000 3,00"],
    expected: [],
  },
  {
    name: "stop before unrelated percentage or cash figures",
    lines: ["IVA BASE IMPONIBLE (€) CUOTA (€)", "10% 30,00 3,00", "21% 10,00 CAMBIO 2,10"],
    expected: [[10, 3000, 300]],
  },
];
for (const sample of taxTableCases) {
  try {
    const interpreted = interpret(sample.lines).taxLines;
    const inferred = interpreted.filter((row) => row.ratePercent !== null && row.baseCents !== null && row.taxCents !== null);
    assert.deepEqual(inferred.map((row) => [row.ratePercent, row.baseCents, row.taxCents]), sample.expected, sample.name);
    for (const row of inferred) {
      assert.equal(row.trust, "doubtful", sample.name + ": inferred columns require review");
      assert.equal(row.evidence.length, 2, sample.name + ": header and original row retained");
      assert.equal(row.evidence[0].rawText, sample.lines[0], sample.name + ": header evidence retained");
      assert.ok(sample.lines.includes(row.evidence[1].rawText), sample.name + ": row evidence retained");
    }
    if (!sample.expected.length) assert.ok(interpreted.every((row) => row.trust !== "reliable"), sample.name + ": malformed row cannot be certified");
    console.log("PASS · " + sample.name);
  } catch (error) {
    failures++;
    console.error("FAIL · " + sample.name, error.message);
  }
}

const refund = interpret(["DEVOLUCION PRODUCTO −12,34"]).lines[0];
try {
  assert.ok(refund, "refund line item retained");
  assert.equal(refund.totalCents, -1234, "negative refund retains exact sign in cents");
  assert.equal(refund.evidence[0].rawText, "DEVOLUCION PRODUCTO −12,34", "refund source preserved");
  console.log("PASS · refund minus sign remains negative");
} catch (error) {
  failures++;
  console.error("FAIL · refund minus sign remains negative", error.message);
}

const lineItem = interpret(["MANZANAS 1,234 kg 3,50"]).lines[0];
try {
  assert.ok(lineItem, "weight line item is retained");
  assert.equal(lineItem.totalCents, 350, "line item total uses full 3,50 only");
  assert.equal(lineItem.unitPriceCents, null, "weight 1,234 is not 1,23 euros");
  assert.equal(lineItem.evidence[0].rawText, "MANZANAS 1,234 kg 3,50", "line item source preserved");
  console.log("PASS · three decimal weight does not become unit price");
} catch (error) {
  failures++;
  console.error("FAIL · three decimal weight does not become unit price", error.message);
}

console.log(`OCR label selection, synthetic interpretation only: ${cases.length + taxLineCases.length + taxTableCases.length + 2 - failures}/${cases.length + taxLineCases.length + taxTableCases.length + 2} PASS`);
if (failures) process.exitCode = 1;
