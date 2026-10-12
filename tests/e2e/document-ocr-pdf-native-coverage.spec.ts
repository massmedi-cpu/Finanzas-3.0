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
