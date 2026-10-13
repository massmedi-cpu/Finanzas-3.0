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

test("REC-OCR-105 · FECHA/HORA de ticket confirma fecha y hora con evidencia", () => {
  const observed = interpretDocumentOcrFinancially(result([
    line("datetime", "FECHA/HORA: 11/10/2026 19:35", 0.97, 0.12),
    line("total", "TOTAL 7,90 €", 0.96, 0.85),
  ]));
  expect(observed.date.value).toBe("2026-10-11");
  expect(observed.date.trust).toBe("reliable");
  expect(observed.time.value).toBe("19:35");
  expect(observed.time.trust).toBe("reliable");
  expect(observed.date.evidence[0]?.lineId).toBe("datetime");
  expect(observed.time.evidence[0]?.lineId).toBe("datetime");
});

test("REC-OCR-106 · FECHA Y HORA acepta el formato de puntos sin alterar la fecha", () => {
  const observed = interpretDocumentOcrFinancially(result([
    line("datetime", "Fecha y hora: 11.10.2026 08:05", 0.93, 0.12),
  ]));
  expect(observed.date.value).toBe("2026-10-11");
  expect(observed.date.trust).toBe("reliable");
  expect(observed.time.value).toBe("08:05");
  expect(observed.time.trust).toBe("reliable");
});

test("REC-OCR-107 · vencimiento en la misma línea no oculta una emisión explícita", () => {
  const observed = interpretDocumentOcrFinancially(result([
    line("datetime", "Fecha de emisión: 11/10/2026 15:20 · Vencimiento: 24/10/2026", 0.96, 0.12),
  ]));
  expect(observed.date.value).toBe("2026-10-11");
  expect(observed.date.trust).toBe("reliable");
  expect(observed.time.value).toBe("15:20");
  expect(observed.time.trust).toBe("reliable");
});

test("REC-OCR-108 · vencimiento y horarios no inventan compra ni hora de emisión", () => {
  const observed = interpretDocumentOcrFinancially(result([
    line("expiry", "Fecha de vencimiento: 24/10/2026 16:00", 0.99, 0.12),
    line("hours", "Horario apertura: 09:00 a 22:00", 0.99, 0.17),
  ]));
  expect(observed.date.value).toBeNull();
  expect(observed.date.trust).toBe("not_detected");
  expect(observed.time.value).toBeNull();
  expect(observed.time.trust).toBe("not_detected");
});


test("REC-OCR-109 · customer section spread over lines cannot become an issuer", () => {
  const raw = result([
    line("heading", "DATOS DEL CLIENTE", 0.99, 0.05),
    line("recipient", "CLIENTE INDUSTRIAL SL", 0.99, 0.10),
    line("customer-tax", "CIF B12345678", 0.99, 0.14),
    line("total", "TOTAL 30,00 €", 0.98, 0.80),
  ]);
  const interpretation = interpretDocumentOcrFinancially(raw);
  expect(interpretation.issuer.value).toBeNull();
  expect(interpretation.issuer.trust).toBe("not_detected");
  expect(interpretation.totalCents.value).toBe(3000);
  expect(raw.plainText).toContain("CLIENTE INDUSTRIAL SL");
});

test("REC-OCR-110 · explicitly named seller takes precedence over customer section", () => {
  const raw = result([
    line("heading", "DESTINATARIO", 0.99, 0.05),
    line("recipient", "COMPRADOR EJEMPLO SL", 0.99, 0.10),
    line("issuer", "Emisor: PROVEEDOR AUTENTICO SL", 0.96, 0.20),
    line("total", "TOTAL 35,00 €", 0.97, 0.80),
  ]);
  const interpretation = interpretDocumentOcrFinancially(raw);
  expect(interpretation.issuer.value).toBe("PROVEEDOR AUTENTICO SL");
  expect(interpretation.issuer.trust).toBe("reliable");
  expect(interpretation.issuer.evidence[0]?.lineId).toBe("issuer");
});

test("REC-OCR-111 · page-two labelled dates require review, first-page issue dates may be reliable", () => {
  const raw = result([line("heading", "FACTURA DE SERVICIOS", 0.98, 0.05)]);
  const annex = line("legal-date", "Fecha: 23/09/2026", 0.99, 0.10);
  raw.pages.push({ pageNumber: 2, lines: [annex], plainText: annex.text, layoutText: annex.text });
  const interpretation = interpretDocumentOcrFinancially(raw);
  expect(interpretation.date.value).toBe("2026-09-23");
  expect(interpretation.date.trust).toBe("doubtful");
  expect(interpretation.date.evidence[0]?.pageNumber).toBe(2);

  const clear = interpretDocumentOcrFinancially(result([
    line("date", "Fecha de emisión: 23/09/2026", 0.96),
  ]));
  expect(clear.date.value).toBe("2026-09-23");
  expect(clear.date.trust).toBe("reliable");
});


test("REC-OCR-112 · customer CIF on a continuation line is not assigned to issuer", () => {
  const raw = result([
    line("head", "DATOS DEL CLIENTE", 0.99, 0.05),
    line("customer-name", "CLIENTE COMERCIAL SA", 0.99, 0.10),
    line("customer-tax-id", "CIF B12345674", 0.99, 0.15),
    line("total", "TOTAL 40,00 €", 0.99, 0.85),
  ]);
  const parsed = interpretDocumentOcrFinancially(raw);
  expect(parsed.taxId.value).toBeNull();
  expect(parsed.taxId.trust).toBe("not_detected");
  expect(parsed.issuer.value).toBeNull();
  expect(raw.plainText).toContain("B12345674");

  // An explicit invoice issuer supersedes the recipient block.
  const both = result([
    line("head", "DATOS DEL CLIENTE", 0.99, 0.05),
    line("customer-tax-id", "CIF B12345674", 0.99, 0.10),
    line("seller-tax-id", "Emisor CIF B12345678", 0.97, 0.20),
  ]);
  const owned = interpretDocumentOcrFinancially(both);
  expect(owned.taxId.value).toBe("B12345678");
  expect(owned.taxId.evidence[0]?.lineId).toBe("seller-tax-id");
});


test("REC-OCR-113 · labeled legal issuer names are trusted, recipient names still require review", () => {
  for (const label of ["Vendedor", "Establecimiento", "Razón social del emisor", "Razón social proveedor"]) {
    const raw = result([
      line("recipient", "Razón social: CLIENTE EJEMPLO SL", 0.99, 0.05),
      line("seller", label + ": TIENDA EXPRESA SL", 0.96, 0.16),
    ]);
    const interpretation = interpretDocumentOcrFinancially(raw);
    expect(interpretation.issuer.value, label).toBe("TIENDA EXPRESA SL");
    expect(interpretation.issuer.trust, label).toBe("reliable");
    expect(interpretation.issuer.evidence[0]?.lineId, label).toBe("seller");
  }
  const ambiguous = interpretDocumentOcrFinancially(result([
    line("recipient", "Razón social del destinatario: CLIENTE EJEMPLO SL", 0.99),
  ]));
  expect(ambiguous.issuer.trust).not.toBe("reliable");
});


test("REC-OCR-114 · CIF del emisor puede seguir a su encabezado; CIF del cliente nunca hereda ese permiso", () => {
  const validSeller = interpretDocumentOcrFinancially(result([
    line("heading", "DATOS DEL EMISOR", 0.99, 0.05),
    line("company", "Proveedor Comercial SL", 0.99, 0.10),
    line("cif", "CIF B12345674", 0.97, 0.15),
    line("recipient-heading", "DATOS DEL CLIENTE", 0.99, 0.20),
    line("recipient-cif", "CIF B12345678", 0.99, 0.25),
  ]));
  expect(validSeller.taxId.value).toBe("B12345674");
  expect(validSeller.taxId.trust).toBe("reliable");
  expect(validSeller.taxId.evidence[0]?.lineId).toBe("cif");

  const invalidSeller = interpretDocumentOcrFinancially(result([
    line("heading", "DATOS DEL EMISOR", 0.99, 0.05),
    line("cif", "CIF B12345678", 0.99, 0.10),
  ]));
  expect(invalidSeller.taxId.value).toBe("B12345678");
  expect(invalidSeller.taxId.trust).toBe("doubtful");

  const customerOnly = interpretDocumentOcrFinancially(result([
    line("heading", "DATOS DEL CLIENTE", 0.99, 0.05),
    line("cif", "CIF B12345674", 0.99, 0.10),
  ]));
  expect(customerOnly.taxId.value).toBeNull();
  expect(customerOnly.taxId.trust).toBe("not_detected");
});


test("REC-OCR-115 · razón social explícita de destinatario no produce falso emisor", () => {
  const raw = result([
    line("recipient", "Razón social del destinatario: CLIENTE INDUSTRIAL SL", 0.99, 0.05),
    line("total", "TOTAL 40,00 €", 0.96, 0.8),
  ]);
  const parsed = interpretDocumentOcrFinancially(raw);
  expect(parsed.issuer.value).toBeNull();
  expect(parsed.issuer.trust).toBe("not_detected");
  expect(parsed.totalCents.value).toBe(4000);
  expect(raw.plainText).toContain("CLIENTE INDUSTRIAL SL");

  // A standalone legal-name label has ambiguous ownership; expose it
  // for human review without elevating the field to "reliable".
  const unknown = interpretDocumentOcrFinancially(result([
    line("legal", "Razón social: EMPRESA NO ATRIBUIDA SL", 0.99),
  ]));
  expect(unknown.issuer.value).toBe("EMPRESA NO ATRIBUIDA SL");
  expect(unknown.issuer.trust).toBe("doubtful");
});

test("REC-OCR-116 · time from continuation page is doubtful, not a certified purchase timestamp", () => {
  const raw = result([line("header", "FACTURA SERVICIOS", 0.99, 0.03)]);
  const annex = line("annex-time", "FECHA/HORA: 13/10/2026 14:05", 0.99, 0.08);
  raw.pages.push({
    pageNumber: 2,
    lines: [annex],
    plainText: annex.text,
    layoutText: annex.text,
  });
  const parsed = interpretDocumentOcrFinancially(raw);
  expect(parsed.date.value).toBe("2026-10-13");
  expect(parsed.date.trust).toBe("doubtful");
  expect(parsed.time.value).toBe("14:05");
  expect(parsed.time.trust).toBe("doubtful");
  expect(parsed.time.evidence[0]?.pageNumber).toBe(2);

  const ticket = interpretDocumentOcrFinancially(result([
    line("ticket-time", "FECHA/HORA: 13/10/2026 14:05", 0.97, 0.08),
  ]));
  expect(ticket.date.trust).toBe("reliable");
  expect(ticket.time.trust).toBe("reliable");
});


test("REC-OCR-117 · Razón social bajo bloque de destinatario nunca se presenta como vendedor", () => {
  const original = result([
    line("heading", "DATOS DEL CLIENTE", 0.99, 0.04),
    line("customer-name", "Razón social: CLIENTE DE EJEMPLO SL", 0.99, 0.10),
    line("customer-cif", "CIF B12345674", 0.99, 0.15),
    line("total", "TOTAL 42,00 €", 0.98, 0.90),
  ]);
  const parsed = interpretDocumentOcrFinancially(original);
  expect(parsed.issuer.value).toBeNull();
  expect(parsed.issuer.trust).toBe("not_detected");
  expect(parsed.taxId.value).toBeNull();
  expect(parsed.totalCents.value).toBe(4200);
  expect(original.plainText).toContain("CLIENTE DE EJEMPLO SL");

  // A new explicit supplier heading returns ownership to the merchant.
  const owned = interpretDocumentOcrFinancially(result([
    line("heading", "DATOS DEL CLIENTE", 0.99, 0.04),
    line("recipient", "Razón social: CLIENTE DE EJEMPLO SL", 0.99, 0.10),
    line("supplier-heading", "DATOS DEL EMISOR", 0.99, 0.14),
    line("supplier", "Razón social: COMERCIO DEL SUR SL", 0.97, 0.20),
  ]));
  expect(owned.issuer.value).toBe("COMERCIO DEL SUR SL");
  expect(owned.issuer.trust).toBe("doubtful");
  expect(owned.issuer.evidence[0]?.lineId).toBe("supplier");
});


test("REC-OCR-118 · invoice reference shaped as a calendar date is always doubtful", () => {
  for (const candidate of ["12/10/2026", "12-10-2026", "2026/10/12"]) {
    const parsed = interpretDocumentOcrFinancially(result([
      line("document-number", "Factura: " + candidate, 0.99),
    ]));
    expect(parsed.documentNumber.value).toBe(candidate);
    expect(parsed.documentNumber.trust).toBe("doubtful");
    expect(parsed.documentNumber.evidence[0]?.lineId).toBe("document-number");
  }
  const genuine = interpretDocumentOcrFinancially(result([
    line("number", "Factura: F-2026-0042", 0.98),
  ]));
  expect(genuine.documentNumber.value).toBe("F-2026-0042");
  expect(genuine.documentNumber.trust).toBe("reliable");
});


test("REC-OCR-119 · rejected card and pending transfers cannot become paid methods", () => {
  for (const raw of [
    "Tarjeta rechazada", "Tarjeta denegada", "No se acepta efectivo",
    "Pago pendiente por transferencia", "Sin tarjeta",
  ]) {
    const parsed = interpretDocumentOcrFinancially(result([
      line("not-paid", raw, 0.99),
    ]));
    expect(parsed.paymentMethod.value, raw).toBeNull();
    expect(parsed.paymentMethod.trust, raw).toBe("not_detected");
  }
  const settled = interpretDocumentOcrFinancially(result([
    line("settled", "Tarjeta rechazada. Forma de pago: Efectivo", 0.99),
  ]));
  expect(settled.paymentMethod.value).toBe("Efectivo");
  expect(settled.paymentMethod.trust).toBe("reliable");
});


test("REC-OCR-120 · a blank legal-name heading never becomes a merchant", () => {
  const onlyLabel = interpretDocumentOcrFinancially(result([
    line("header", "Razón social", 0.99),
  ]));
  expect(onlyLabel.issuer.value).toBeNull();
  expect(onlyLabel.issuer.trust).toBe("not_detected");

  const undelimited = interpretDocumentOcrFinancially(result([
    line("company", "Razón social EMPRESA LOCAL SL", 0.99),
  ]));
  expect(undelimited.issuer.value).toBe("EMPRESA LOCAL SL");
  expect(undelimited.issuer.trust).toBe("doubtful");

  const labelled = interpretDocumentOcrFinancially(result([
    line("company", "Razón social: EMPRESA LOCAL SL", 0.99),
  ]));
  expect(labelled.issuer.value).toBe("EMPRESA LOCAL SL");
  expect(labelled.issuer.trust).toBe("doubtful");
});


test("REC-OCR-121 · a shared customer/issuer row must choose the supplier's own fiscal ID", () => {
  const raw = result([
    line("both", "Cliente CIF B87654321 · Emisor CIF B12345674", 0.99),
  ]);
  const parsed = interpretDocumentOcrFinancially(raw);
  expect(parsed.taxId.value).toBe("B12345674");
  expect(parsed.taxId.trust).toBe("reliable");
  expect(parsed.taxId.evidence[0]?.lineId).toBe("both");
  expect(raw.plainText).toContain("Cliente CIF B87654321");

  const reversed = interpretDocumentOcrFinancially(result([
    line("both-reversed", "Emisor CIF B12345674 / Cliente CIF B87654321", 0.97),
  ]));
  expect(reversed.taxId.value).toBe("B12345674");
  expect(reversed.taxId.trust).toBe("reliable");
});

test("REC-OCR-122 · standalone customer-owned tax ID cannot be inferred as an issuer even with 99% OCR", () => {
  const raw = result([
    line("owner", "RAZÓN SOCIAL DEL CLIENTE", 0.99, 0.05),
    line("tax", "CIF B12345674", 0.99, 0.10),
  ]);
  const parsed = interpretDocumentOcrFinancially(raw);
  expect(parsed.taxId.value).toBeNull();
  expect(parsed.taxId.trust).toBe("not_detected");

  const attributed = interpretDocumentOcrFinancially(result([
    line("tax", "CIF del destinatario B12345674", 0.99),
  ]));
  expect(attributed.taxId.value).toBeNull();
  expect(attributed.taxId.trust).toBe("not_detected");
});


test("REC-OCR-123 · comercio in a client trading name is not a certified seller CIF", () => {
  const customerTradingName = interpretDocumentOcrFinancially(result([
    line("client-trade", "Cliente: Comercio DEL BARRIO SL CIF B12345674", 0.99, 0.1),
  ]));
  expect(customerTradingName.taxId.trust).not.toBe("reliable");

  const separateOwners = interpretDocumentOcrFinancially(result([
    line("both", "Cliente CIF B87654321 · Emisor CIF B12345674", 0.99, 0.1),
  ]));
  expect(separateOwners.taxId.value).toBe("B12345674");
  expect(separateOwners.taxId.trust).toBe("reliable");
});
