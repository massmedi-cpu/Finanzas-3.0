export type ReceiptTextFitInput = {
  text: string;
  boxWidth: number;
  fontSize: number;
  explicitTextLength?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Conserva el ancho físico que Tesseract midió en el ticket siempre que sea
 * geométricamente plausible. Así la reconstrucción mantiene densidad,
 * columnas y centrado sin deformar lecturas con cajas OCR anómalas.
 */
export function receiptTextLength(input: ReceiptTextFitInput) {
  const explicit = Number(input.explicitTextLength);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const text = input.text.trim();
  const boxWidth = Number(input.boxWidth);
  const fontSize = Number(input.fontSize);
  if (text.length < 2 || !Number.isFinite(boxWidth) || boxWidth <= 0 || !Number.isFinite(fontSize) || fontSize <= 0) return undefined;

  const glyphs = Array.from(text).length;
  const estimatedNaturalWidth = Math.max(fontSize * 0.9, glyphs * fontSize * 0.54);
  const ratio = boxWidth / estimatedNaturalWidth;

  // Una caja extremadamente estrecha/ancha suele ser ruido de segmentación.
  // En esos casos priorizamos legibilidad y no forzamos el glifo.
  if (ratio < 0.46 || ratio > 2.35) return undefined;

  return clamp(boxWidth, estimatedNaturalWidth * 0.5, estimatedNaturalWidth * 2.2);
}
