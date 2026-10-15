import { expect, test } from "@playwright/test";
import { interpretDocumentOcrFinancially, OCR_FIELD_TRUST_LABELS } from "../../src/domain/document-ocr-financial-interpretation";
import { summarizeDocumentOcrReview } from "../../src/application/document-ocr-review";
import type { DocumentOcrResult, OcrLine } from "../../src/domain/document-ocr";

test("REC-OCR-137 · year-first dates preserve issue ownership and Spanish presentation semantics", () => {
  for (const date of ["2028-02-29", "2028.02.29", "2028/02/29"]) {
    const raw = result([line("number", `Número de factura: DEMO-82 Fecha de Factura: ${date}`, 0.99)]);
    const interpreted = interpretDocumentOcrFinancially(raw);
    expect(interpreted.date.value).toBe("2028-02-29");
    expect(interpreted.date.trust).toBe("reliable");
    expect(raw.plainText).toContain(date);
  }
});

test("REC-OCR-138 · an unlabelled ISO date remains reviewable rather than disappearing", () => {
  const interpreted = interpretDocumentOcrFinancially(result([
    line("number-date", "AB-9032 - 2025-12-19"),
    line("service-date", "2025-12-18. Servicio urbano"),
  ]));
  expect(interpreted.date.value).toBe("2025-12-19");
  expect(interpreted.date.trust).toBe("doubtful");
});

test("REC-OCR-139 · invalid and payment-only ISO dates cannot become the invoice issue date", () => {
  for (const text of ["Fecha de factura: 2027.02.29", "Fecha de vencimiento: 2028-02-29", "Periodo: 2028/02/01 - 2028/02/29"]) {
    expect(interpretDocumentOcrFinancially(result([line("unrelated", text)])).date.value).toBeNull();
  }
});

test("REC-OCR-140 · an order date earlier on a merged row cannot replace the labelled issue date", () => {
  const interpreted = interpretDocumentOcrFinancially(result([
    line("dates", "Fecha de pedido: 2028.02.12 Fecha de factura: 2028.02.29", 0.99),
  ]));
  expect(interpreted.date.value).toBe("2028-02-29");
  expect(interpreted.date.trust).toBe("reliable");
});

test("REC-OCR-141 · pagination, account metadata, addresses and consumption periods are not merchants", () => {
  const interpreted = interpretDocumentOcrFinancially(result([
    line("page", "Pag. 1", 0.99, 0.01),
    line("account", "Nº de cuenta: 123456", 0.99, 0.03),
    line("address", "C/ Río, 42, 28002. España.", 0.99, 0.05),
    line("period", "Periodo de consumo: 04 de julio de 2028 a 04 de agosto de 2028", 0.99, 0.07),
  ]));
  expect(interpreted.issuer.value).toBeNull();
  expect(interpreted.issuer.trust).toBe("not_detected");
});

test("REC-OCR-142 · legal business header beats metadata without claiming verified seller ownership", () => {
  const interpreted = interpretDocumentOcrFinancially(result([
    line("page", "Pag. 1", 0.99, 0.01),
    line("account", "Nº de cuenta: 123456", 0.99, 0.03),
    line("issuer", "SUMINISTROS AURORA S.L. CIF B12345674", 0.99, 0.12),
    line("recipient", "Cliente: COMPRAS DEL SUR SL", 0.99, 0.2),
  ]));
  expect(interpreted.issuer.value).toBe("SUMINISTROS AURORA S.L.");
  expect(interpreted.issuer.trust).toBe("doubtful");
});

test("REC-OCR-143 · a repeated recipient's legal name cannot masquerade as the seller", () => {
  const interpreted = interpretDocumentOcrFinancially(result([
    line("recipient-bare", "COMPRAS DEL SUR SL CIF B12345674", 0.99, 0.05),
    line("recipient", "Cliente: COMPRAS DEL SUR SL", 0.99, 0.2),
  ]));
  expect(interpreted.issuer.value).toBeNull();
});

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

function columnLine(id: string, cells: Array<[string, number, number?]>, y: number): OcrLine {
  const words = cells.map(([text, x, width = 0.04]) => ({ text, confidence: 0.98, box: { x, y, width, height: 0.02 } }));
  return { ...line(id, cells.map(([text]) => text).join(" "), 0.98, y), words };
}

test("REC-OCR-144 · named invoice holder and address continuation never become a seller", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("metadata", "Ref. domiciliación: 123456", 0.99, 0.02),
    line("holder", "Titular: PERSONA DE EJEMPLO", 0.99, 0.04),
    line("address", "BLOQUE G PISO 6 PUERTA 9", 0.99, 0.06),
  ]));
  expect(parsed.issuer.value).toBeNull();
});

test("REC-OCR-145 · geometry selects the payable total before base and tax columns", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    columnLine("header", [["EAN",0.05],["DESCRIPCIÓN",0.2,0.12],["CANTIDAD",0.45],["PVP",0.55],["DESCUENTO",0.65],["TOTAL PVP",0.75],["BASE",0.85],["% IVA",0.93]],0.1),
    columnLine("product", [["1234567890123",0.03,0.1],["PRODUCTO A",0.2,0.12],["3,000",0.45],["15,00",0.55],["-4,00",0.65],["11,00",0.75],["10,00",0.85],["10,00",0.93]],0.15),
    line("tax-header", "TIPO % IMPUESTO BASE CUOTA TOTAL",0.99,0.2),
    line("tax-row", "IVA 10,00 10,00 1,00 11,00",0.99,0.25),
  ]));
  expect(parsed.lines).toHaveLength(1);
  expect(parsed.lines[0]).toMatchObject({description:"PRODUCTO A",quantity:3,unitPriceCents:null,totalCents:1100,trust:"reliable"});
});

test("REC-OCR-146 · quantity printed inside a receipt description remains separate from its name", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    columnLine("header", [["Descripción",0.1,0.15],["P. Unit",0.65],["Importe",0.85]],0.1),
    columnLine("product", [["3 PRODUCTO A",0.1,0.25],["7,00",0.65],["21,00",0.85]],0.2),
  ]));
  expect(parsed.lines[0]).toMatchObject({description:"PRODUCTO A",quantity:3,unitPriceCents:700,totalCents:2100,trust:"reliable"});
});

test("REC-OCR-147 · unpriced table rows stay unknown and tax summaries are not purchases", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    columnLine("header", [["Modelo",0.1,0.15],["Unidades",0.65],["Importe Total",0.85]],0.1),
    columnLine("unpriced", [["ACCESORIO A",0.1,0.25],["1",0.65]],0.2),
    line("summary", "Importe Bruto: EUR 100,00",0.99,0.3),
    line("fee", "Aportación reciclaje: 0,08",0.99,0.35),
  ]));
  expect(parsed.lines).toHaveLength(1);
  expect(parsed.lines[0]).toMatchObject({description:"ACCESORIO A",quantity:1,totalCents:null,trust:"doubtful"});
});

test("REC-OCR-148 · a monetary fragment without a product table is not a certified purchase", () => {
  const parsed = interpretDocumentOcrFinancially(result([line("note","Referencia aproximada de consumo 100,00",0.99)]));
  expect(parsed.lines[0].trust).toBe("doubtful");
});

test("REC-OCR-149 · a company name is isolated from another field merged onto its OCR row", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("issuer","SUMINISTROS AURORA S.L.U. Fecha de cargo: 20 de agosto de 2028",0.99),
  ]));
  expect(parsed.issuer.value).toBe("SUMINISTROS AURORA S.L.U.");
  expect(parsed.issuer.trust).toBe("doubtful");
});

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


test("REC-OCR-124 · fiscal ownership survives original OCR punctuation before normalization", () => {
  for (const divider of [" · ", " | ", "; ", " / "]) {
    const parsed = interpretDocumentOcrFinancially(result([
      line("shared", "Cliente CIF B87654321" + divider + "Emisor CIF B12345674", 0.99),
    ]));
    expect(parsed.taxId.value, divider).toBe("B12345674");
    expect(parsed.taxId.trust, divider).toBe("reliable");
    expect(parsed.taxId.evidence[0]?.lineId).toBe("shared");
  }
});

test("REC-OCR-125 · different issuer IDs require review even with valid checksums", () => {
  const conflicting = interpretDocumentOcrFinancially(result([
    line("first", "Emisor CIF B12345674", 0.99, 0.05),
    line("second", "Emisor NIF 12345678Z", 0.99, 0.10),
  ]));
  expect(conflicting.taxId.trust).toBe("doubtful");
  expect(["B12345674", "12345678Z"]).toContain(conflicting.taxId.value);
  expect(conflicting.taxId.evidence).toHaveLength(1);

  const identical = interpretDocumentOcrFinancially(result([
    line("first", "Emisor CIF B12345674", 0.99, 0.05),
    line("repeat", "Proveedor CIF B12345674", 0.97, 0.10),
  ]));
  expect(identical.taxId.value).toBe("B12345674");
  expect(identical.taxId.trust).toBe("reliable");
});


test("REC-OCR-126 · conflicting labelled invoice dates cannot be auto-trusted", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("date-first", "Fecha de emisión: 12/10/2026", 0.99, 0.10),
    line("date-second", "Fecha de emisión: 13/10/2026", 0.99, 0.20),
  ]));
  expect(["2026-10-12", "2026-10-13"]).toContain(parsed.date.value);
  expect(parsed.date.trust).toBe("doubtful");

  const consistent = interpretDocumentOcrFinancially(result([
    line("date-first", "Fecha: 12/10/2026", 0.99, 0.10),
    line("date-repeat", "Fecha de factura: 12/10/2026", 0.99, 0.20),
  ]));
  expect(consistent.date.value).toBe("2026-10-12");
  expect(consistent.date.trust).toBe("reliable");
});

test("REC-OCR-127 · contradictory explicit payment times require human verification", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("time-first", "Hora de compra: 10:15", 0.98, 0.10),
    line("time-second", "Hora de compra: 10:45", 0.99, 0.20),
  ]));
  expect(parsed.time.trust).toBe("doubtful");
  expect(["10:15", "10:45"]).toContain(parsed.time.value);

  const consistent = interpretDocumentOcrFinancially(result([
    line("time-first", "Hora: 10:15", 0.98, 0.10),
    line("time-again", "Hora de compra: 10:15", 0.99, 0.20),
  ]));
  expect(consistent.time.value).toBe("10:15");
  expect(consistent.time.trust).toBe("reliable");
});


test("REC-OCR-128 · empty seller headers never masquerade as business names", () => {
  for (const header of ["DATOS DEL EMISOR", "Datos del proveedor", "Información del vendedor", "Emisor:", "Datos fiscales"]) {
    const parsed = interpretDocumentOcrFinancially(result([
      line("heading", header, 0.99),
      line("number", "CIF B12345674", 0.99, 0.18),
    ]));
    expect(parsed.issuer.value, header).toBeNull();
    expect(parsed.issuer.trust, header).toBe("not_detected");
    expect(parsed.taxId.value, header).toBe("B12345674");
  }

  const hasName = interpretDocumentOcrFinancially(result([
    line("heading", "DATOS DEL EMISOR", 0.99, 0.05),
    line("seller", "TIENDA DEL SUR SL", 0.96, 0.10),
  ]));
  expect(hasName.issuer.value).toBe("TIENDA DEL SUR SL");
  expect(hasName.issuer.trust).toBe("doubtful");
  expect(hasName.issuer.evidence[0]?.lineId).toBe("seller");
});

test("REC-OCR-129 · IVA o IGIC matemáticamente imposible no es fiable aunque el OCR marque 99 %", () => {
  for (const acronym of ["IVA", "IGIC"]) {
    const raw = result([
      line("tax", `Base imponible 100,00 ${acronym} 21 % 19,00`, 0.99, 0.50),
    ]);
    const original = raw.plainText;
    const parsed = interpretDocumentOcrFinancially(raw);
    expect(parsed.taxLines[0]?.ratePercent, acronym).toBe(21);
    expect(parsed.taxLines[0]?.baseCents, acronym).toBe(10000);
    expect(parsed.taxLines[0]?.taxCents, acronym).toBe(1900);
    expect(parsed.taxLines[0]?.trust, acronym).toBe("doubtful");
    expect(parsed.taxBaseCents.trust, acronym).toBe("doubtful");
    expect(parsed.taxesCents.trust, acronym).toBe("doubtful");
    expect(parsed.warnings, acronym).toContain("tax_rate_arithmetic_mismatch");
    expect(raw.plainText, acronym).toBe(original);
  }
});

test("REC-OCR-130 · cuota correcta y redondeo máximo de un céntimo no provocan falsa alarma", () => {
  for (const [base, quota] of [["100,00", "21,00"], ["10,01", "2,11"]]) {
    const parsed = interpretDocumentOcrFinancially(result([
      line("tax", `Base imponible ${base} IVA 21 % ${quota}`, 0.99),
    ]));
    expect(parsed.taxLines[0]?.trust).toBe("reliable");
    expect(parsed.warnings).not.toContain("tax_rate_arithmetic_mismatch");
  }
});

test("REC-OCR-131 · la revisión visible nunca recomienda confirmar cuota contradictoria", () => {
  const raw = result([
    line("tax", "Base imponible 100,00 IVA 21 % 19,00", 0.99, 0.50),
  ]);
  const review = summarizeDocumentOcrReview(raw);
  expect(review.financialWarnings).toContain("tax_rate_arithmetic_mismatch");
  expect(review.nextAction).toBe("review");
  expect(review.nextActionLabel).toContain("Compara");
  expect(review.financialFields.find((field) => field.key === "taxBaseCents")?.trust).toBe("doubtful");
  expect(review.financialFields.find((field) => field.key === "taxesCents")?.trust).toBe("doubtful");
});


test("REC-OCR-150 · a merged TOTAL IVA row preserves the later TOTAL A PAGAR amount", () => {
  const original = result([line("summary", "TOTAL IVA 2,10 TOTAL A PAGAR 22,10", 0.99)]);
  const parsed = interpretDocumentOcrFinancially(original);
  expect(parsed.totalCents.value).toBe(2210);
  expect(parsed.totalCents.trust).toBe("reliable");
  expect(parsed.totalCents.rawValue).toBe("22,10");
  expect(original.plainText).toBe("TOTAL IVA 2,10 TOTAL A PAGAR 22,10");
});

test("REC-OCR-151 · an excluded discounts heading cannot hide a later ordinary TOTAL", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("summary", "TOTAL DESCUENTOS 3,50 TOTAL 21,50", 0.99),
  ]));
  expect(parsed.totalCents.value).toBe(2150);
  expect(parsed.totalCents.rawValue).toBe("21,50");
});

test("REC-OCR-152 · only a tax/discount summary never becomes an invoice grand total", () => {
  for (const text of ["TOTAL IVA 2,10", "TOTAL DESCUENTOS 3,50", "TOTAL IMPUESTOS 2,10"]) {
    const parsed = interpretDocumentOcrFinancially(result([line("tax-only", text, 0.99)]));
    expect(parsed.totalCents.value, text).toBeNull();
    expect(parsed.totalCents.trust, text).toBe("not_detected");
  }
});

test("REC-OCR-153 · a merged tax heading does not swallow the explicit IMPORTE TOTAL FACTURA", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("summary", "TOTAL IMPUESTOS 4,80 IMPORTE TOTAL FACTURA 28,00", 0.99),
  ]));
  expect(parsed.totalCents.value).toBe(2800);
  expect(parsed.totalCents.rawValue).toBe("28,00");
});


test("REC-OCR-154 · split TOTAL (€) label and amount remain reviewable with both source lines", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("total-label", "TOTAL (€)", 0.99, 0.30),
    line("total-money", "29,18 €", 0.94, 0.35),
  ]));
  expect(parsed.totalCents.value).toBe(2918);
  expect(parsed.totalCents.trust).toBe("doubtful");
  expect(parsed.totalCents.evidence.map((entry) => entry.lineId)).toEqual(["total-label", "total-money"]);
  expect(parsed.totalCents.confidence).toBe(0.94);
});

test("REC-OCR-155 · split labelled totals accept EUR but never borrow an unrelated next line", () => {
  for (const label of ["TOTAL EUR", "IMPORTE TOTAL (EUR)", "TOTAL A PAGAR (€)"]) {
    const parsed = interpretDocumentOcrFinancially(result([
      line("label", label, 0.98, 0.4),
      line("single-money", "26,20", 0.95, 0.45),
    ]));
    expect(parsed.totalCents.value, label).toBe(2620);
    expect(parsed.totalCents.trust, label).toBe("doubtful");
  }
  const ambiguous = interpretDocumentOcrFinancially(result([
    line("label", "TOTAL (€)", 0.99, 0.4),
    line("amounts", "BASE 20,00 IVA 4,20", 0.98, 0.45),
  ]));
  expect(ambiguous.totalCents.value).toBeNull();
});


test("REC-OCR-156 · grouped thousands separated by ordinary spaces preserve the whole invoice value", () => {
  const raw = result([line("total", "TOTAL A PAGAR 1 234,56 €", 0.98)]);
  const parsed = interpretDocumentOcrFinancially(raw);
  expect(parsed.totalCents.value).toBe(123456);
  expect(parsed.totalCents.rawValue).toBe("1 234,56");
  expect(parsed.totalCents.trust).toBe("reliable");
  expect(raw.plainText).toBe("TOTAL A PAGAR 1 234,56 €");
});

test("REC-OCR-157 · PDF nonbreaking and narrow no-break spaces retain multi-group amount evidence", () => {
  for (const separator of ["\u00a0", "\u202f"]) {
    const printed = ["1", "234", "567,89"].join(separator);
    const parsed = interpretDocumentOcrFinancially(result([line("total", "IMPORTE TOTAL: " + printed, 0.99)]));
    expect(parsed.totalCents.value, "group separator " + separator.codePointAt(0)?.toString(16)).toBe(123456789);
    expect(parsed.totalCents.rawValue).toBe(printed);
  }
});

test("REC-OCR-158 · a spaced minus sign must not turn a refund into an expense", () => {
  for (const raw of ["- 1 234,56", "− 1\u202f234,56", "– 1\u00a0234,56"]) {
    const parsed = interpretDocumentOcrFinancially(result([line("refund", "TOTAL " + raw, 0.99)]));
    expect(parsed.totalCents.value, raw).toBe(-123456);
    expect(parsed.totalCents.rawValue, raw).toBe(raw);
    expect(parsed.totalCents.trust, raw).toBe("reliable");
  }
});

test("REC-OCR-159 · euro-prefixed whole amounts and spaced thousands stay exact", () => {
  for (const printed of ["TOTAL EUR 1 234", "TOTAL € 1\u202f234", "TOTAL 1\u00a0234 €"]) {
    const parsed = interpretDocumentOcrFinancially(result([line("total", printed, 0.99)]));
    expect(parsed.totalCents.value, printed).toBe(123400);
    expect(parsed.totalCents.trust, printed).toBe("reliable");
  }
});

test("REC-OCR-160 · alternate grouped decimal has two cents and incomplete numeric fractions stay rejected", () => {
  const parsed = interpretDocumentOcrFinancially(result([line("total", "TOTAL 1,234.56", 0.99)]));
  expect(parsed.totalCents.value).toBe(123456);
  expect(parsed.totalCents.rawValue).toBe("1,234.56");
  for (const printed of ["TOTAL 1,234 €", "TOTAL 1 234,567 €", "TOTAL 21,00%"]) {
    const untrusted = interpretDocumentOcrFinancially(result([line("invalid", printed, 0.99)]));
    expect(untrusted.totalCents.value, printed).toBeNull();
  }
});

test("REC-OCR-161 · grouped base plus VAT reconciles against a grouped final amount", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("base", "Base imponible 1 000,00", 0.99, 0.10),
    line("tax", "IVA 210,00", 0.99, 0.20),
    line("total", "TOTAL A PAGAR 1\u202f210,00 €", 0.99, 0.30),
  ]));
  expect(parsed.taxBaseCents.value).toBe(100000);
  expect(parsed.taxesCents.value).toBe(21000);
  expect(parsed.totalCents.value).toBe(121000);
  expect(parsed.warnings).not.toContain("base_plus_tax_mismatch");
  expect(parsed.totalCents.trust).toBe("reliable");
});


test("REC-OCR-166 · a real payable on the same row as VAT total survives adjacent tax-table detection", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("tax-head", "TIPO IVA BASE IMPONIBLE CUOTA", 0.99, 0.10),
    line("tax-row", "21% 10,00 2,10", 0.99, 0.20),
    line("payable", "TOTAL IVA 2,10 TOTAL A PAGAR 12,10", 0.99, 0.30),
  ]));
  expect(parsed.totalCents.value).toBe(1210);
  expect(parsed.totalCents.rawValue).toBe("12,10");
  expect(parsed.totalCents.evidence[0]?.lineId).toBe("payable");
});

test("REC-OCR-167 · a genuine two-column tax-table footer is not the grand total", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("tax-head", "TIPO IVA BASE IMPONIBLE CUOTA", 0.99, 0.10),
    line("tax-row", "21% 10,00 2,10", 0.99, 0.20),
    line("tax-footer", "TOTAL 10,00 2,10", 0.99, 0.30),
  ]));
  expect(parsed.totalCents.value).toBeNull();
  expect(parsed.totalCents.trust).toBe("not_detected");
});

test("REC-OCR-168 · an invoice-labelled final total after TAX TOTAL is not a tax-table footer", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("tax-head", "TIPO IVA BASE IMPONIBLE CUOTA", 0.99, 0.10),
    line("tax-row", "21% 20,00 4,20", 0.99, 0.20),
    line("payable", "TOTAL IMPUESTOS 4,80 IMPORTE TOTAL FACTURA 28,00", 0.99, 0.30),
  ]));
  expect(parsed.totalCents.value).toBe(2800);
  expect(parsed.totalCents.rawValue).toBe("28,00");
});


test("REC-OCR-169 · dangling IMPORTE TOTAL after VAT footer cannot borrow a previous tax amount", () => {
  const parsed = interpretDocumentOcrFinancially(result([
    line("tax-head", "TIPO IVA BASE IMPONIBLE CUOTA", 0.99, 0.10),
    line("tax-row", "21% 10,00 2,10", 0.99, 0.20),
    line("ambiguous-footer", "TOTAL 10,00 2,10 IMPORTE TOTAL", 0.99, 0.30),
  ]));
  expect(parsed.totalCents.value).toBeNull();
  expect(parsed.totalCents.trust).toBe("not_detected");
});
