import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import { pdfNativeTextNeedsVisualOcr, pdfVisualOcrImprovesNative } from "../../src/infrastructure/ocr/pdf-native-coverage";

// Isolated recognition-policy regressions: no documents, bank accounts,
// credentials or remote OCR services are used.
function words(text: string): OcrWord[] {
  return text.split(/\s+/).filter(Boolean).map((part, index) => ({
    text: part, confidence: 0.98,
    box: { x: 0.08 + (index % 6) * 0.12, y: 0.08 + Math.floor(index / 6) * 0.03, width: 0.1, height: 0.025 },
  }));
}

const boilerplate = [
  "DOCUMENTO GENERADO ELECTRÓNICAMENTE POR EL SISTEMA DE GESTIÓN",
  "Consulte la política de privacidad, el registro de actividad,",
  "la referencia y las condiciones generales de este emisor.",
].join(" ");

test("REC-OCR-324 · selectable page subtotals cannot suppress the scanned invoice body", () => {
  for (const label of ["TOTAL PÁGINA", "TOTAL DE LA PÁGINA", "TOTAL PÁG. 1", "TOTAL HOJA", "TOTAL A TRANSPORTAR", "TOTAL TRANSPORTADO", "TOTAL ANTERIOR"]) {
    const overlay = words(`${label} 12,10 EUR ${boilerplate.repeat(3)}`);
    expect(pdfNativeTextNeedsVisualOcr(overlay), label).toBe(true);
    expect(pdfVisualOcrImprovesNative(overlay, words("FACTURA TOTAL A PAGAR 24,20 EUR")), label).toBe(true);
    const actualTotal = words(`${label} 12,10 EUR TOTAL FACTURA 24,20 EUR ${boilerplate.repeat(3)}`);
    expect(pdfNativeTextNeedsVisualOcr(actualTotal), label).toBe(false);
    expect(pdfVisualOcrImprovesNative(actualTotal, words("FACTURA TOTAL 99,99 EUR")), label).toBe(false);
  }
});

test("REC-OCR-043 · fully image-only PDF requires visual OCR", () => {
  expect(pdfNativeTextNeedsVisualOcr([])).toBe(true);
});

test("REC-OCR-044 · selectable stamp does not masquerade as a readable invoice", () => {
  expect(pdfNativeTextNeedsVisualOcr(words("1"))).toBe(true);
  expect(pdfNativeTextNeedsVisualOcr(words("TOTAL"))).toBe(true);
});

test("REC-OCR-045 · medium-length selectable legal footer still permits scanning the raster body", () => {
  expect(boilerplate.length).toBeGreaterThan(110);
  expect(boilerplate.length).toBeLessThan(260);
  expect(words(boilerplate).length).toBeGreaterThan(5);
  expect(pdfNativeTextNeedsVisualOcr(words(boilerplate))).toBe(true);
});

test("REC-OCR-046 · more than five native words and 90 characters alone prove no invoice", () => {
  const text = "Aviso legal. Contenido generado por sistema. Consulte las condiciones y los términos publicados para este fichero.";
  expect(text.length).toBeGreaterThan(90);
  expect(pdfNativeTextNeedsVisualOcr(words(text))).toBe(true);
});

test("REC-OCR-047 · actual selectable invoice total suppresses unnecessary expensive fallback", () => {
  const invoice = [
    "Factura de suministro de agua de octubre 2026.",
    "Emisor de prueba con dirección y código postal en Sevilla.",
    "Concepto: cuota mensual de suministro.",
    "BASE IMPONIBLE 19,38. IVA 4,07. TOTAL 23,45 €.",
  ].join(" ");
  expect(invoice.length).toBeGreaterThan(110);
  expect(invoice.length).toBeLessThan(260);
  expect(pdfNativeTextNeedsVisualOcr(words(invoice))).toBe(false);
});

test("REC-OCR-048 · financial heading alone never proves that scanned amounts were extracted", () => {
  const text = "Factura TOTAL correspondiente a una referencia administrativa. " + boilerplate.slice(0, 105);
  expect(text.length).toBeGreaterThan(110);
  expect(pdfNativeTextNeedsVisualOcr(words(text))).toBe(true);
});

test("REC-OCR-049 · random decimal in footer does not prove a native invoice", () => {
  const text = boilerplate + " Versión 2,45 del sistema de archivo.";
  expect(text.length).toBeLessThan(260);
  expect(pdfNativeTextNeedsVisualOcr(words(text))).toBe(true);
});

test("REC-OCR-050 · a euro amount before the number is valid native invoice evidence", () => {
  const text = "Factura de comercio con descripción de artículos entregados al destinatario. "
    + "Importe TOTAL € 50. Datos fiscales y referencias generales para la conservación del documento.";
  expect(text.length).toBeGreaterThan(110);
  expect(text.length).toBeLessThan(260);
  expect(pdfNativeTextNeedsVisualOcr(words(text))).toBe(false);
});

test("REC-OCR-051 · long genuine native text avoids costly OCR retries", () => {
  const longText = (boilerplate + " ").repeat(3);
  expect([...longText].filter(char => /[\p{L}\p{N}]/u.test(char)).length).toBeGreaterThan(260);
  expect(pdfNativeTextNeedsVisualOcr(words(longText))).toBe(false);
});


test("REC-OCR-052 · short visual invoice total beats a longer native-only legal footer", () => {
  const native = words(boilerplate);
  const visual = words("FACTURA TOTAL 23,45 €");
  expect(visual.length).toBeLessThan(native.length);
  expect(pdfVisualOcrImprovesNative(native, visual)).toBe(true);
});

test("REC-OCR-053 · OCR never replaces usable native evidence with an unrelated tax rate", () => {
  expect(pdfVisualOcrImprovesNative(words(boilerplate), words("IVA 21%"))).toBe(false);
  expect(pdfVisualOcrImprovesNative(words(boilerplate), words("TOTAL 21%"))).toBe(false);
});

test("REC-OCR-054 · short unreliable OCR is never allowed to override native content", () => {
  const unreliable = words("TOTAL 23,45").map((word) => ({ ...word, confidence: 0.28 }));
  expect(pdfVisualOcrImprovesNative(words(boilerplate), unreliable)).toBe(false);
});

test("REC-OCR-055 · authentic native invoice total has precedence over noisy scanned amount", () => {
  const native = words("Factura registrada. TOTAL 45,30 €. " + boilerplate.slice(0, 110));
  expect(pdfVisualOcrImprovesNative(native, words("TOTAL 23,45"))).toBe(false);
});

test("REC-OCR-056 · valid visual euro-prefixed total recovers missing raster document", () => {
  expect(pdfVisualOcrImprovesNative(words(boilerplate), words("TOTAL € 50"))).toBe(true);
});

test("REC-OCR-057 · no visual words means no apparent OCR improvement", () => {
  expect(pdfVisualOcrImprovesNative(words(boilerplate), [])).toBe(false);
  expect(pdfVisualOcrImprovesNative([], words("TOTAL 23,45"))).toBe(true);
});

test("REC-OCR-058 · an actually richer visual layer still takes priority", () => {
  expect(pdfVisualOcrImprovesNative(words("Referencia 1"), words(boilerplate))).toBe(true);
});


test("REC-OCR-059 · three-decimal rate is not mistaken for a monetary total in native layer", () => {
  const text = "Documento TOTAL 1,234. " + boilerplate.slice(0, 145);
  expect(text.length).toBeLessThan(260);
  expect(pdfNativeTextNeedsVisualOcr(words(text))).toBe(true);
});

test("REC-OCR-060 · percentage with decimal and whitespace is never a monetary total", () => {
  const native = words("TOTAL 21,00 % " + boilerplate.slice(0, 150));
  const visual = words("TOTAL 21,00 %");
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(true);
  expect(pdfVisualOcrImprovesNative(words(boilerplate), visual)).toBe(false);
});

test("REC-OCR-061 · invoice total in full ISO EU thousands notation remains valid", () => {
  const invoice = words("FACTURA ORIGINAL. TOTAL 1.234,50 € " + boilerplate.slice(0, 120));
  expect(pdfNativeTextNeedsVisualOcr(invoice)).toBe(false);
  expect(pdfVisualOcrImprovesNative(words(boilerplate), words("TOTAL 1.234,50 €"))).toBe(true);
});

test("REC-OCR-062 · false positive decimal substring inside a reference is rejected", () => {
  const candidate = words("Importe TOTAL 1234,567 " + boilerplate.slice(0, 140));
  expect(pdfNativeTextNeedsVisualOcr(candidate)).toBe(true);
  expect(pdfVisualOcrImprovesNative(words(boilerplate), words("TOTAL 1234,567"))).toBe(false);
});


test("REC-OCR-063 · five substantial native invoice spans remain fast-path despite missing total", () => {
  const nativeLines = [
    "Factura del suministro correspondiente al periodo 01-09 a 30-09",
    "Proveedor y domicilio fiscal detallados, CIF, condiciones de pago",
    "Concepto, base imponible e impuestos aplicables para cada producto",
    "Número de factura emitida, importe",
    "Datos completos de la operación",
  ];
  const native = nativeLines.map((text, index) => ({
    text, confidence: 1,
    box: { x: 0.05, y: index * 0.14, width: 0.88, height: 0.08 },
  }));
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(false);
});

test("REC-OCR-064 · long one-span hidden footer still cannot mask a scanned total", () => {
  const footer = [
    "DOCUMENTO ESCANEADO QUE GUARDA UNA CAPA DE METADATOS SOLO PARA REFERENCIA LEGAL.",
    "EL SISTEMA DE ARCHIVO NO INCLUYE EN ESTE TEXTO LOS DATOS FINANCIEROS DEL",
    "JUSTIFICANTE ORIGINAL, QUE PERMANECE COMO IMAGEN Y NECESITA RECONOCIMIENTO.",
  ].join(" ");
  expect(footer.length).toBeGreaterThan(210);
  expect(footer.length).toBeLessThan(260);
  expect(pdfNativeTextNeedsVisualOcr([{
    text: footer, confidence: 1,
    box: { x: 0.02, y: 0.92, width: 0.92, height: 0.03 },
  }])).toBe(true);
});


test("REC-OCR-067 · punctuation after an explicit euro invoice total is not a decimal continuation", () => {
  const text = "Factura de comercio. IMPORTE TOTAL € 50. " + boilerplate.slice(0, 115);
  expect(text.length).toBeGreaterThan(110);
  expect(text.length).toBeLessThan(260);
  expect(pdfNativeTextNeedsVisualOcr(words(text))).toBe(false);
});

test("REC-OCR-068 · a two-decimal total followed by a sentence full stop remains money", () => {
  const text = "Factura original. TOTAL 23,45. " + boilerplate.slice(0, 118);
  expect(pdfNativeTextNeedsVisualOcr(words(text))).toBe(false);
});

test("REC-OCR-069 · 3-decimal total-like continuation still triggers review", () => {
  const text = "Factura original. TOTAL € 50,234. " + boilerplate.slice(0, 118);
  expect(pdfNativeTextNeedsVisualOcr(words(text))).toBe(true);
});


test("REC-OCR-070 · more than 260 characters in one hidden native footer still require visual OCR", () => {
  const overlay = boilerplate.repeat(3);
  expect(overlay.length).toBeGreaterThan(260);
  const footerWord: OcrWord = {
    text: overlay, confidence: 1,
    box: { x: 0.02, y: 0.93, width: 0.96, height: 0.025 },
  };
  expect(pdfNativeTextNeedsVisualOcr([footerWord])).toBe(true);
});

test("REC-OCR-071 · six lengthy native footer spans cannot conceal the scanned invoice", () => {
  const footer = Array.from({ length: 6 }, (_, index): OcrWord => ({
    text: boilerplate, confidence: 1,
    box: { x: 0.05, y: 0.82 + index * 0.025, width: 0.9, height: 0.02 },
  }));
  expect(footer.length).toBeGreaterThanOrEqual(5);
  expect(footer.map((word) => word.text).join(" ").length).toBeGreaterThan(260);
  expect(pdfNativeTextNeedsVisualOcr(footer)).toBe(true);
});

test("REC-OCR-072 · a long authentic native invoice with total is retained without visual OCR", () => {
  const invoice = "FACTURA DE PRUEBA. IMPORTE TOTAL 123,45 € " + boilerplate.repeat(3);
  const native: OcrWord = {
    text: invoice, confidence: 1,
    box: { x: 0.02, y: 0.82, width: 0.95, height: 0.04 },
  };
  expect(pdfNativeTextNeedsVisualOcr([native])).toBe(false);
});

test("REC-OCR-073 · longer visual legal boilerplate must not replace a real native total", () => {
  const native = words("Factura de suministro. TOTAL 42,35 €");
  const unrelatedVisual = words(boilerplate.repeat(4));
  expect(unrelatedVisual.length).toBeGreaterThan(native.length);
  expect(pdfVisualOcrImprovesNative(native, unrelatedVisual)).toBe(false);
});

test("REC-OCR-074 · visual invoice total can still recover a native-only legal footer", () => {
  const native = words(boilerplate);
  const visual = words("FACTURA ORIGINAL. TOTAL 42,35 €");
  expect(pdfVisualOcrImprovesNative(native, visual)).toBe(true);
});


test("REC-OCR-075 · VAT amount following an empty TOTAL is not a native invoice total", () => {
  const overlay = "TOTAL pendiente de revisión. IVA 12,50 € " + boilerplate.repeat(2);
  const native: OcrWord = {
    text: overlay, confidence: 1,
    box: { x: 0.03, y: 0.9, width: 0.93, height: 0.035 },
  };
  expect(pdfNativeTextNeedsVisualOcr([native])).toBe(true);
});

test("REC-OCR-076 · a scanned invoice TOTAL can outrank a native VAT-only footer", () => {
  const native = words("TOTAL pendiente de revisión. IVA 12,50 € " + boilerplate);
  const visual = words("FACTURA ORIGINAL TOTAL 23,45 €");
  expect(pdfVisualOcrImprovesNative(native, visual)).toBe(true);
});

test("REC-OCR-077 · long low-confidence visual noise never displaces readable native words", () => {
  const native = words("Sello de archivo y referencia de factura.");
  const uncertainVisual = words(boilerplate.repeat(4)).map((word) => ({ ...word, confidence: 0.12 }));
  expect(uncertainVisual.length).toBeGreaterThan(native.length);
  expect(pdfVisualOcrImprovesNative(native, uncertainVisual)).toBe(false);
});

test("REC-OCR-078 · image-only PDF retains low-confidence OCR for explicit user review", () => {
  const uncertainVisual = words("FACTURA TOTAL 23,45").map((word) => ({ ...word, confidence: 0.12 }));
  expect(pdfVisualOcrImprovesNative([], uncertainVisual)).toBe(true);
});


test("REC-OCR-084 · a single long native VAT span without an invoice total cannot bypass visual OCR", () => {
  const text = "FACTURA ORIGINAL. TOTAL pendiente. IVA 12,50 € " + boilerplate.repeat(3);
  const native: OcrWord = {
    text, confidence: 1,
    box: { x: 0.02, y: 0.90, width: 0.95, height: 0.04 },
  };
  expect(text.length).toBeGreaterThan(260);
  expect(pdfNativeTextNeedsVisualOcr([native])).toBe(true);
});


test("REC-OCR-085 · lengthy conflicting raster OCR never overwrites a true native invoice total", () => {
  const native = words("FACTURA ORIGINAL. TOTAL 45,30 €");
  const visual = words("FACTURA OCR TOTAL 23,45 € " + boilerplate.repeat(4));
  expect(visual.length).toBeGreaterThan(native.length);
  expect(pdfVisualOcrImprovesNative(native, visual)).toBe(false);
});

test("REC-OCR-086 · OCR can recover a scanned invoice if native text has only VAT", () => {
  const native = words("IVA 9,45 € " + boilerplate);
  const visual = words("FACTURA ORIGINAL. TOTAL 54,45 €");
  expect(pdfVisualOcrImprovesNative(native, visual)).toBe(true);
});


test("REC-OCR-089 · long multi-span selectable top banner cannot hide scanned body", () => {
  const native = Array.from({ length: 6 }, (_, index): OcrWord => ({
    text: boilerplate, confidence: 1,
    box: { x: 0.05, y: 0.02 + index * 0.022, width: 0.9, height: 0.019 },
  }));
  expect(native.map(word => word.text).join(" ").length).toBeGreaterThan(260);
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(true);
});

test("REC-OCR-090 · genuine native invoice text spanning the page remains fast-path", () => {
  const native = Array.from({ length: 6 }, (_, index): OcrWord => ({
    text: boilerplate, confidence: 1,
    box: { x: 0.05, y: 0.06 + index * 0.12, width: 0.9, height: 0.045 },
  }));
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(false);
});

test("REC-OCR-091 · a verified native total remains authoritative even in a narrow header", () => {
  const native = Array.from({ length: 6 }, (_, index): OcrWord => ({
    text: index === 0 ? "FACTURA TOTAL 45,30 EUR" : boilerplate,
    confidence: 1,
    box: { x: 0.05, y: 0.03 + index * 0.02, width: 0.9, height: 0.015 },
  }));
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(false);
});


test("REC-OCR-092 · native invoice with TOTAL 45 EUR cannot be overwritten by a longer conflicting OCR", () => {
  const native = words("Factura original con importe TOTAL 45 EUR");
  const conflicting = words("FACTURA TOTAL 23,45 EUR " + boilerplate.repeat(3));
  expect(pdfVisualOcrImprovesNative(native, conflicting)).toBe(false);
});

test("REC-OCR-093 · euro words after an integer support thousands without false percentage evidence", () => {
  const native = words("FACTURA ORIGINAL TOTAL 1.234 euros " + boilerplate.slice(0, 128));
  const conflicting = words("TOTAL 12,34 EUR " + boilerplate.repeat(2));
  expect(pdfVisualOcrImprovesNative(native, conflicting)).toBe(false);
  expect(pdfVisualOcrImprovesNative(words(boilerplate), conflicting)).toBe(true);
});

test("REC-OCR-094 · selectable header and footer cannot mask an entirely rasterized invoice body", () => {
  const text = [...Array(3).fill(boilerplate), ...Array(3).fill(boilerplate)];
  const native = text.map((value, index): OcrWord => ({
    text: value,
    confidence: 1,
    box: { x: 0.04, y: index < 3 ? 0.02 + index * 0.04 : 0.83 + (index - 3) * 0.04,
      width: 0.9, height: 0.02 },
  }));
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(true);
});

test("REC-OCR-095 · a valid native invoice with central words skips redundant rasterization", () => {
  const native = [
    { text: boilerplate, confidence: 1, box: { x: 0.04, y: 0.04, width: 0.9, height: 0.03 } },
    { text: boilerplate, confidence: 1, box: { x: 0.04, y: 0.17, width: 0.9, height: 0.03 } },
    { text: boilerplate, confidence: 1, box: { x: 0.04, y: 0.32, width: 0.9, height: 0.03 } },
    { text: boilerplate, confidence: 1, box: { x: 0.04, y: 0.49, width: 0.9, height: 0.03 } },
    { text: boilerplate, confidence: 1, box: { x: 0.04, y: 0.67, width: 0.9, height: 0.03 } },
    { text: boilerplate, confidence: 1, box: { x: 0.04, y: 0.85, width: 0.9, height: 0.03 } },
  ];
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(false);
});

test("REC-OCR-096 · header and footer including true native financial total remain authoritative", () => {
  const native = [
    { text: "FACTURA TOTAL 45 EUR", confidence: 1, box: { x: 0.04, y: 0.02, width: 0.9, height: 0.03 } },
    ...Array.from({ length: 4 }, (_, index) => ({
      text: boilerplate, confidence: 1,
      box: { x: 0.04, y: index < 2 ? 0.07 + index * 0.04 : 0.84 + (index - 2) * 0.04, width: 0.9, height: 0.03 },
    })),
  ];
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(false);
});


test("REC-OCR-100 · an explicit native whole-EUR total followed by sentence punctuation is valid", () => {
  const native = words("FACTURA ORIGINAL TOTAL 45 EUR. " + boilerplate);
  const visual = words("FACTURA TOTAL 23,45 EUR " + boilerplate.repeat(3));
  expect(pdfVisualOcrImprovesNative(native, visual)).toBe(false);
});

test("REC-OCR-101 · a numeric continuation after whole-euro currency is not a proven total", () => {
  const native = words("FACTURA TOTAL 45 EUR,50 " + boilerplate.slice(0, 90));
  const visual = words("FACTURA TOTAL 23,45 EUR");
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(true);
  expect(pdfVisualOcrImprovesNative(native, visual)).toBe(true);
});

test("REC-OCR-102 · euro-symbol totals with final punctuation retain native precedence", () => {
  const native = words("FACTURA TOTAL 45 €. " + boilerplate);
  const visual = words("FACTURA TOTAL 23,45 " + boilerplate.repeat(4));
  expect(pdfVisualOcrImprovesNative(native, visual)).toBe(false);
});


test("REC-OCR-103 · full-height left-margin native stamps cannot hide raster financial body", () => {
  const native = Array.from({ length: 7 }, (_, index): OcrWord => ({
    text: boilerplate, confidence: 1,
    box: { x: 0.02, y: 0.03 + index * 0.12, width: 0.15, height: 0.05 },
  }));
  expect(native.map(word => word.text).join(" ").length).toBeGreaterThan(260);
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(true);
});

test("REC-OCR-104 · both narrow margins without central selectable content require raster OCR", () => {
  const native = Array.from({ length: 8 }, (_, index): OcrWord => ({
    text: boilerplate, confidence: 1,
    box: { x: index % 2 ? 0.82 : 0.02, y: 0.02 + index * 0.10,
      width: 0.15, height: 0.04 },
  }));
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(true);
});

test("REC-OCR-105 · a full digital invoice with center-page content avoids margin fallback", () => {
  const native = Array.from({ length: 7 }, (_, index): OcrWord => ({
    text: boilerplate, confidence: 1,
    box: { x: 0.18, y: 0.03 + index * 0.12, width: 0.55, height: 0.05 },
  }));
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(false);
});

test("REC-OCR-106 · a genuine native total is retained even if the text lives in a narrow margin", () => {
  const native = Array.from({ length: 7 }, (_, index): OcrWord => ({
    text: index === 0 ? "FACTURA TOTAL 45 EUR." : boilerplate,
    confidence: 1,
    box: { x: 0.02, y: 0.03 + index * 0.12, width: 0.15, height: 0.05 },
  }));
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(false);
  expect(pdfVisualOcrImprovesNative(native, words("FACTURA TOTAL 23,45 EUR"))).toBe(false);
});


test("REC-OCR-162 · selectable tax TOTAL alone cannot hide a scanned PDF grand total", () => {
  for (const heading of ["TOTAL IVA 2,10", "TOTAL IMPUESTOS 2,10", "TOTAL DE IMPUESTOS 2,10", "TOTAL DESCUENTOS 4,20"]) {
    const overlay = words(heading + ". " + boilerplate.slice(0, 116));
    expect(pdfNativeTextNeedsVisualOcr(overlay), heading).toBe(true);
  }
});

test("REC-OCR-163 · tax-only native total never beats visually recovered invoice payable", () => {
  const visual = words("FACTURA FINAL. TOTAL A PAGAR 121,00 €");
  for (const taxOnly of ["TOTAL IVA 21,00", "TOTAL IMPUESTOS 21,00", "TOTAL DESCUENTOS 4,20"]) {
    const native = words(taxOnly + ". " + boilerplate.slice(0, 113));
    expect(pdfVisualOcrImprovesNative(native, visual), taxOnly).toBe(true);
  }
});

test("REC-OCR-164 · a genuine payable after a tax total remains selectable evidence", () => {
  const native = words("TOTAL IVA 2,10 TOTAL A PAGAR 22,10 " + boilerplate.slice(0, 92));
  expect(pdfNativeTextNeedsVisualOcr(native)).toBe(false);
  expect(pdfVisualOcrImprovesNative(native, words("TOTAL 99,00"))).toBe(false);
});

test("REC-OCR-165 · long tax-only overlays also require raster inspection", () => {
  const taxOverlay = words("TOTAL IMPUESTOS 21,00 " + boilerplate.repeat(3));
  expect(taxOverlay.length).toBeGreaterThan(5);
  expect(pdfNativeTextNeedsVisualOcr(taxOverlay)).toBe(true);
});


test("REC-OCR-329 · native tax table footer with base and quota cannot hide raster payable total", () => {
  const footerOnly = words(
    "TIPO % IMPUESTO BASE CUOTA IVA 21 25,37 3,81 TOTAL 25,37 3,81. " + boilerplate.repeat(3),
  );
  const realPayable = words("FACTURA ORIGINAL TOTAL A PAGAR 29,18 €");
  expect(pdfNativeTextNeedsVisualOcr(footerOnly)).toBe(true);
  expect(pdfVisualOcrImprovesNative(footerOnly, realPayable)).toBe(true);
});

test("REC-OCR-330 · a payable total following the tax footer remains authoritative", () => {
  const document = words(
    "TIPO % IMPUESTO BASE CUOTA IVA 21 25,37 3,81 TOTAL 25,37 3,81 "
    + "IMPORTE TOTAL FACTURA 29,18 € " + boilerplate.repeat(2),
  );
  expect(pdfNativeTextNeedsVisualOcr(document)).toBe(false);
  expect(pdfVisualOcrImprovesNative(document, words("TOTAL 99,00 €"))).toBe(false);
});

test("REC-OCR-331 · two-amount total without tax-table evidence is not discarded", () => {
  const original = words("FACTURA ORIGINAL TOTAL 25,37 3,81 " + boilerplate.repeat(2));
  expect(pdfNativeTextNeedsVisualOcr(original)).toBe(false);
});


test("REC-OCR-333 · an extra-long tax-table overlay still requires raster OCR before the native fast path", () => {
  const footer = "TIPO % IMPUESTO BASE CUOTA IVA 21 25,37 3,81 TOTAL 25,37 3,81 ";
  const longOnly = words(footer + boilerplate.repeat(8));
  expect(longOnly.length).toBeGreaterThan(30);
  expect(pdfNativeTextNeedsVisualOcr(longOnly)).toBe(true);
  const withPayable = words(footer + "IMPORTE TOTAL FACTURA 29,18 € " + boilerplate.repeat(8));
  expect(pdfNativeTextNeedsVisualOcr(withPayable)).toBe(false);
});
