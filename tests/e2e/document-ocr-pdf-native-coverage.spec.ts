import { expect, test } from "@playwright/test";
import type { OcrWord } from "../../src/domain/document-ocr";
import { pdfNativeTextNeedsVisualOcr } from "../../src/infrastructure/ocr/pdf-native-coverage";

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
