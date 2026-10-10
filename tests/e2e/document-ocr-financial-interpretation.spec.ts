import { expect, test } from "@playwright/test";
import { interpretDocumentOcrFinancially, OCR_FIELD_TRUST_LABELS } from "../../src/domain/document-ocr-financial-interpretation";
import type { DocumentOcrResult, OcrLine } from "../../src/domain/document-ocr";

function line(id: string, text: string, confidence = 0.95, y = 0.1): OcrLine {
  return {
    id,
    text,
    confidence,
    alignment: "left",
    box: { x: 0.05, y, width: 0.9, height: 0.04 },
    words: [{ text, confidence, box: { x: 0.05, y, width: 0.9, height: 0.04 } }],
  };
}

function result(lines: OcrLine[]): DocumentOcrResult {
  return {
    contractVersion: 1,
    documentId: "11111111-1111-4111-8111-111111111111",
    status: "ready",
    source: "image_ocr",
    extractor: "test",
    extractedAt: "2026-10-01T12:00:00.000Z",
    confidence: 0.95,
    plainText: lines.map((item) => item.text).join("\n"),
    pages: [{ pageNumber: 1, lines, plainText: lines.map((item) => item.text).join("\n"), layoutText: lines.map((item) => item.text).join("\n") }],
    warnings: [],
    principles: { bankSource: "read_only", financialWrites: false, requiresHumanReview: true, preservesGeometry: true },
  };
}

test("extracts the Axioma financial fields without mutating raw OCR", async () => {
  const raw = result([
    line("issuer", "Comercio: TIENDA SEVILLA SL", 0.96, 0.05),
    line("tax", "CIF B12345678", 0.94, 0.10),
    line("date", "Fecha: 01/10/2026 13:45", 0.93, 0.15),
    line("number", "Factura: F-2026-0042", 0.91, 0.20),
    line("period", "Periodo: 01/09/2026 - 30/09/2026", 0.90, 0.25),
    line("item", "Servicio mensual 100,00", 0.88, 0.35),
    line("base", "Base imponible 100,00", 0.97, 0.70),
    line("vat", "IVA 21 % 21,00", 0.96, 0.75),
    line("total", "TOTAL 121,00 €", 0.98, 0.80),
    line("pay", "Pago con tarjeta VISA", 0.86, 0.85),
  ]);
  const originalText = raw.plainText;
  const interpretation = interpretDocumentOcrFinancially(raw);

  expect(interpretation.issuer.value).toBe("TIENDA SEVILLA SL");
  expect(interpretation.taxId.value).toBe("B12345678");
  expect(interpretation.date.value).toBe("2026-10-01");
  expect(interpretation.time.value).toBe("13:45");
  expect(interpretation.documentNumber.value).toBe("F-2026-0042");
  expect(interpretation.period.value).toBe("01/09/2026 - 30/09/2026");
  expect(interpretation.taxBaseCents.value).toBe(10000);
  expect(interpretation.taxesCents.value).toBe(2100);
  expect(interpretation.totalCents.value).toBe(12100);
  expect(interpretation.paymentMethod.value).toBe("Tarjeta");
  expect(interpretation.lines.some((item) => item.description.includes("Servicio mensual") && item.totalCents === 10000)).toBeTruthy();
  expect(interpretation.warnings).not.toContain("base_plus_tax_mismatch");
  expect(raw.plainText).toBe(originalText);
  expect(raw.principles).toEqual({ bankSource: "read_only", financialWrites: false, requiresHumanReview: true, preservesGeometry: true });
});

test("does not invent absent fields and marks weak evidence as doubtful", async () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("issuer", "PANADERIA DEL BARRIO", 0.60),
    line("total", "TOTAL 1.234,56 €", 0.60, 0.8),
  ]));

  expect(interpretation.issuer.trust).toBe("doubtful");
  expect(interpretation.totalCents.value).toBe(123456);
  expect(interpretation.totalCents.trust).toBe("doubtful");
  expect(interpretation.taxId.value).toBeNull();
  expect(interpretation.taxId.trust).toBe("not_detected");
  expect(interpretation.date.value).toBeNull();
  expect(OCR_FIELD_TRUST_LABELS.not_detected).toBe("No detectado");
  expect(OCR_FIELD_TRUST_LABELS.doubtful).toBe("Dudoso");
  expect(OCR_FIELD_TRUST_LABELS.reliable).toBe("Fiable");
});

test("flags inconsistent base plus tax instead of coercing the source", async () => {
  const raw = result([
    line("base", "Base imponible 100,00", 0.95),
    line("vat", "IVA 21,00", 0.95, 0.7),
    line("total", "TOTAL 130,00", 0.95, 0.8),
  ]);
  const interpretation = interpretDocumentOcrFinancially(raw);
  expect(interpretation.warnings).toContain("base_plus_tax_mismatch");
  expect(interpretation.totalCents.value).toBe(13000);
  expect(interpretation.taxBaseCents.trust).toBe("doubtful");
  expect(interpretation.taxesCents.trust).toBe("doubtful");
  expect(interpretation.totalCents.trust).toBe("doubtful");
  expect(raw.plainText).toContain("TOTAL 130,00");
});

test("does not turn a generic invoice title into a document number", async () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("title", "FACTURA SIMPLIFICADA", 0.99, 0.05),
    line("issuer", "SUPERMERCADO DEL SUR SL", 0.97, 0.10),
    line("date", "01/10/2026 18:07", 0.95, 0.15),
    line("item", "PAN DE MOLDE 1,85", 0.94, 0.50),
    line("total", "TOTAL 1,85 €", 0.98, 0.85),
  ]));

  expect(interpretation.documentNumber.value).toBeNull();
  expect(interpretation.documentNumber.trust).toBe("not_detected");
  expect(interpretation.date.value).toBe("2026-10-01");
  expect(interpretation.time.value).toBe("18:07");
  expect(interpretation.lines.some((item) => item.description.includes("PAN DE MOLDE") && item.totalCents === 185)).toBeTruthy();
});

test("recognizes a compact ticket layout with an explicit numbered label", async () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("issuer", "CAFETERIA CENTRAL", 0.93, 0.05),
    line("number", "Nº ticket: 00048321", 0.91, 0.12),
    line("date", "01-10-2026 08:31", 0.96, 0.18),
    line("item1", "Cafe con leche 1,60", 0.91, 0.45),
    line("item2", "Tostada aceite 2,40", 0.90, 0.52),
    line("total", "A PAGAR 4,00", 0.97, 0.80),
    line("payment", "Efectivo", 0.94, 0.86),
  ]));

  expect(interpretation.documentNumber.value).toBe("00048321");
  expect(interpretation.totalCents.value).toBe(400);
  expect(interpretation.paymentMethod.value).toBe("Efectivo");
  expect(interpretation.taxBaseCents.value).toBeNull();
  expect(interpretation.taxesCents.value).toBeNull();
  expect(interpretation.lines.filter((item) => item.totalCents !== null)).toHaveLength(2);
});

test("keeps ambiguous weak receipt evidence doubtful instead of promoting it", async () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("issuer", "KIOSKO PLAZA", 0.61, 0.05),
    line("number", "Ticket Nº 77-19", 0.58, 0.10),
    line("item", "Refresco 2,50", 0.57, 0.55),
    line("total", "TOTAL 2,50", 0.59, 0.85),
  ]));

  expect(interpretation.documentNumber.value).toBe("77-19");
  expect(interpretation.documentNumber.trust).toBe("doubtful");
  expect(interpretation.totalCents.trust).toBe("doubtful");
  expect(interpretation.issuer.trust).toBe("doubtful");
});


test("prioritizes an explicit issue date over an earlier unrelated legal date", async () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("conditions", "Válido hasta 10/11/2027", 0.99, 0.05),
    line("period", "Periodo: 01/09/2026 - 30/09/2026", 0.98, 0.10),
    line("date", "Fecha de emisión: 01/10/2026", 0.96, 0.20),
  ]));
  expect(interpretation.date.value).toBe("2026-10-01");
  expect(interpretation.date.trust).toBe("reliable");
  expect(interpretation.date.evidence[0]?.lineId).toBe("date");
});

test("does not invent a document date from expiry and billing period dates", async () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("expiration", "Fecha de vencimiento: 10/11/2026", 0.99, 0.10),
    line("period", "Periodo: 01/09/2026 - 30/09/2026", 0.99, 0.20),
  ]));
  expect(interpretation.date.value).toBeNull();
  expect(interpretation.date.trust).toBe("not_detected");
});

test("keeps an unlabelled receipt date available but requests review", async () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("date", "01-10-2026 08:31", 0.99, 0.10),
    line("total", "TOTAL 4,00", 0.99, 0.90),
  ]));
  expect(interpretation.date.value).toBe("2026-10-01");
  expect(interpretation.date.trust).toBe("doubtful");
  expect(interpretation.date.evidence[0]?.lineId).toBe("date");
});

test("does not confuse a recipient's company with an explicitly named issuer", async () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("recipient", "Razón social: CLIENTE INDUSTRIAL SL", 0.99, 0.10),
    line("issuer", "Emisor: OFICINA SERVICIOS SL", 0.96, 0.18),
  ]));
  expect(interpretation.issuer.value).toBe("OFICINA SERVICIOS SL");
  expect(interpretation.issuer.trust).toBe("reliable");
  expect(interpretation.issuer.evidence[0]?.lineId).toBe("issuer");
});

test("marks an unqualified company name as doubtful even with legible OCR", async () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("company", "Razón social: CLIENTE INDUSTRIAL SL", 0.99, 0.10),
    line("date", "Fecha: 01/10/2026", 0.99, 0.20),
  ]));
  expect(interpretation.issuer.value).toBe("CLIENTE INDUSTRIAL SL");
  expect(interpretation.issuer.trust).toBe("doubtful");
});

test("OCR prefers explicit issuer CIF over an earlier customer CIF", () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("recipient-id", "Cliente: CIF B87654321", 0.99, 0.05),
    line("issuer-id", "Emisor CIF B12345674", 0.96, 0.18),
  ]));
  expect(interpretation.taxId.value).toBe("B12345674");
  expect(interpretation.taxId.trust).toBe("reliable");
  expect(interpretation.taxId.evidence[0]?.lineId).toBe("issuer-id");
});

test("OCR never assigns a recipient-only fiscal ID to the issuer", () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("client", "Datos del cliente - NIF 12345678Z", 0.99, 0.10),
    line("total", "TOTAL 23,00", 0.98, 0.90),
  ]));
  expect(interpretation.taxId.value).toBeNull();
  expect(interpretation.taxId.trust).toBe("not_detected");
});

test("OCR keeps an unassigned NIF as doubtful rather than reliable", () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("tax", "CIF B12345678", 0.99, 0.10),
  ]));
  expect(interpretation.taxId.value).toBe("B12345678");
  expect(interpretation.taxId.trust).toBe("doubtful");
  expect(interpretation.taxId.evidence[0]?.lineId).toBe("tax");
});

test("OCR finds an explicitly attributed issuer ID after a generic fiscal ID", () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("generic", "NIF 12345678Z", 0.99, 0.10),
    line("supplier", "Proveedor: NIF 87654321X", 0.99, 0.20),
  ]));
  expect(interpretation.taxId.value).toBe("87654321X");
  expect(interpretation.taxId.trust).toBe("reliable");
});

test("OCR ignores discount totals when the payable total is explicit", () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("discount", "TOTAL DESCUENTO 30,00", 0.99, 0.60),
    line("payable", "TOTAL A PAGAR 70,00", 0.98, 0.85),
  ]));
  expect(interpretation.totalCents.value).toBe(7000);
  expect(interpretation.totalCents.trust).toBe("reliable");
  expect(interpretation.totalCents.evidence[0]?.lineId).toBe("payable");
});

test("OCR keeps conflicting total candidates available but doubtful", () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("initial", "TOTAL 95,00", 0.99, 0.55),
    line("final", "TOTAL A PAGAR 90,00", 0.98, 0.85),
  ]));
  expect(interpretation.totalCents.value).toBe(9000);
  expect(interpretation.totalCents.trust).toBe("doubtful");
  expect(interpretation.totalCents.evidence.map((entry) => entry.lineId)).toEqual(["initial", "final"]);
});

test("OCR does not downgrade consistent duplicate copies of the same total", () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("total", "TOTAL 25,00", 0.98, 0.55),
    line("card", "TOTAL TARJETA 25,00", 0.97, 0.85),
  ]));
  expect(interpretation.totalCents.value).toBe(2500);
  expect(interpretation.totalCents.trust).toBe("reliable");
});

test("OCR distinguishes store hours from an explicit purchase time", () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("schedule", "Horario apertura: 09:00 - 21:00", 0.99, 0.12),
    line("purchase", "Hora: 13:45", 0.97, 0.22),
  ]));
  expect(interpretation.time.value).toBe("13:45");
  expect(interpretation.time.trust).toBe("reliable");
  expect(interpretation.time.evidence[0]?.lineId).toBe("purchase");
});

test("OCR does not assign shop opening time as document purchase time", () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("schedule", "Horario de apertura: 09:00 - 21:00", 0.99, 0.10),
  ]));
  expect(interpretation.time.value).toBeNull();
  expect(interpretation.time.trust).toBe("not_detected");
});

test("OCR keeps an unlabelled receipt clock available but doubtful", () => {
  const interpretation = interpretDocumentOcrFinancially(result([
    line("clock", "13:45", 0.99, 0.10),
  ]));
  expect(interpretation.time.value).toBe("13:45");
  expect(interpretation.time.trust).toBe("doubtful");
});

test("explicit incorrect CIF checksum remains doubtful, not reliable", () => {
  const x = interpretDocumentOcrFinancially(result([line("bad", "Emisor CIF B12345678", 0.99, 0.10)]));
  expect(x.taxId.value).toBe("B12345678");
  expect(x.taxId.trust).toBe("doubtful");
});
test("explicit DNI uses the Spanish check letter before declaring a reliable ID", () => {
  const good = interpretDocumentOcrFinancially(result([line("good", "Proveedor NIF 12345678Z", 0.99, 0.10)]));
  const bad = interpretDocumentOcrFinancially(result([line("bad", "Proveedor NIF 12345678A", 0.99, 0.10)]));
  expect(good.taxId.trust).toBe("reliable");
  expect(bad.taxId.trust).toBe("doubtful");
});


test("REC-OCR-016 · Spanish written dates identify invoice issue without confusing other dates", () => {
  const cases = [
    { raw: "Nº factura S26XYZ123 emitida el 15 de agosto de 2026", value: "2026-08-15", trust: "reliable" },
    { raw: "Pedido 11/09/2026; factura S26XYZ123 emitida el 15 de agosto de 2026", value: "2026-08-15", trust: "reliable" },
    { raw: "Pedido 14 de agosto de 2026; factura emitida el 16/08/2026", value: "2026-08-16", trust: "reliable" },
    { raw: "Fecha de emisión: 15 de agosto de 2026; emitida el 16/08/2026", value: "2026-08-16", trust: "doubtful" },
    { raw: "Fecha de emisión: 15 de septiembre de 2026", value: "2026-09-15", trust: "reliable" },
    { raw: "Fecha de expedición: 8 de octubre de 2026", value: "2026-10-08", trust: "reliable" },
    { raw: "Fecha: 12 de setiembre de 2026", value: "2026-09-12", trust: "reliable" },
    { raw: "Nº factura A-991 emitida el 15/08/2026", value: "2026-08-15", trust: "reliable" },
    { raw: "Entrega el 15 de agosto de 2026", value: "2026-08-15", trust: "doubtful" },
    { raw: "Vencimiento: 15 de agosto de 2026", value: null, trust: "not_detected" },
    { raw: "Periodo: 1 de agosto de 2026 a 31 de agosto de 2026", value: null, trust: "not_detected" },
    { raw: "Fecha de emisión: 31 de febrero de 2026", value: null, trust: "not_detected" },
  ] as const;
  for (const [index, sample] of cases.entries()) {
    const input = line(`date-${index}`, sample.raw, 0.96);
    const x = interpretDocumentOcrFinancially(result([input]));
    expect(x.date.value, sample.raw).toBe(sample.value);
    expect(x.date.trust, sample.raw).toBe(sample.trust);
    if (sample.value !== null) {
      expect(x.date.evidence[0]?.lineId).toBe(input.id);
      expect(x.date.evidence[0]?.rawText).toBe(sample.raw);
    } else {
      expect(x.date.evidence).toHaveLength(0);
    }
  }
});

test("REC-OCR-017 · date within a legal or billing period does not override explicit issue date", () => {
  const x = interpretDocumentOcrFinancially(result([
    line("expiration", "Fecha de vencimiento: 15 de agosto de 2027", 0.99, 0.05),
    line("billing", "Periodo: 1 de septiembre de 2026 a 30 de septiembre de 2026", 0.99, 0.10),
    line("issue", "Factura S26XYZ123 emitida el 15 de octubre de 2026", 0.97, 0.15),
  ]));
  expect(x.date.value).toBe("2026-10-15");
  expect(x.date.trust).toBe("reliable");
  expect(x.date.evidence).toHaveLength(1);
  expect(x.date.evidence[0]?.lineId).toBe("issue");
});


test("REC-OCR-018 · domiciliada is a payment method only with credible source context", () => {
  const cases = [
    { lines: ["Forma de pago: Domiciliada"], expected: "Domiciliación", trust: "reliable" },
    { lines: ["Medio de pago: Domiciliado"], expected: "Domiciliación", trust: "reliable" },
    { lines: ["Método de pago: Domiciliación"], expected: "Domiciliación", trust: "reliable" },
    { lines: ["Recibo enviado por correo"], expected: null, trust: "not_detected" },
    { lines: ["No domiciliada"], expected: null, trust: "not_detected" },
    { lines: ["Recibo domiciliado 2026"], expected: "Domiciliación", trust: "doubtful" },
    { lines: ["Información sobre tarjeta bancaria", "Forma de pago: Domiciliada"], expected: "Domiciliación", trust: "reliable" },
  ] as const;
  for (const sample of cases) {
    const x = interpretDocumentOcrFinancially(result(sample.lines.map((text, index) => line(`pay-${index}`, text, 0.97, 0.1 + index * 0.06))));
    expect(x.paymentMethod.value, sample.lines.join(" | ")).toBe(sample.expected);
    expect(x.paymentMethod.trust, sample.lines.join(" | ")).toBe(sample.trust);
    if (sample.expected !== null) {
      expect(sample.lines).toContain(x.paymentMethod.evidence[0]?.rawText);
    } else {
      expect(x.paymentMethod.evidence).toHaveLength(0);
    }
  }
});


test("REC-OCR-019 · contradictory issue dates are doubtful and retain both original lines", () => {
  const source = result([
    line("first", "Fecha de emisión: 01/10/2026", 0.98, 0.10),
    line("second", "Factura F-123 emitida el 2 de octubre de 2026", 0.99, 0.20),
  ]);
  const interpreted = interpretDocumentOcrFinancially(source);
  expect(interpreted.date.value).toBe("2026-10-01");
  expect(interpreted.date.trust).toBe("doubtful");
  expect(interpreted.date.evidence.map((item) => item.lineId)).toEqual(["first", "second"]);
  expect(interpreted.date.evidence.map((item) => item.rawText)).toEqual([
    "Fecha de emisión: 01/10/2026",
    "Factura F-123 emitida el 2 de octubre de 2026",
  ]);
  // The source itself must remain intact for review.
  expect(source.pages[0].lines[0].text).toBe("Fecha de emisión: 01/10/2026");
});

test("REC-OCR-020 · repeated matching issue dates remain usable and exclude unlabelled distractions", () => {
  const interpreted = interpretDocumentOcrFinancially(result([
    line("shipment", "Entrega prevista 29 de septiembre de 2026", 0.99, 0.05),
    line("first", "Fecha de emisión: 01/10/2026", 0.99, 0.10),
    line("repeat", "Factura F-123 emitida el 1 de octubre de 2026", 0.98, 0.20),
  ]));
  expect(interpreted.date.value).toBe("2026-10-01");
  expect(interpreted.date.trust).toBe("reliable");
  expect(interpreted.date.evidence[0]?.lineId).toBe("first");
  expect(interpreted.date.evidence).toHaveLength(1);
});
