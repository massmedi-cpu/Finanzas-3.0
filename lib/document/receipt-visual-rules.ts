import type { ReceiptVisualLayoutInput, ReceiptVisualLineInput } from "./receipt-visual-model";

export type ReceiptVisualRule = {
  x1: number;
  x2: number;
  y: number;
  strokeWidth: number;
  pattern: "solid" | "dashed" | "dotted";
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function compactRule(text: string) {
  return text.replace(/\s/g, "");
}

export function isReceiptRuleLine(line: Pick<ReceiptVisualLineInput, "text">) {
  const compact = compactRule(line.text);
  return compact.length >= 5 && /^[\-_.=·•—–]+$/.test(compact);
}

function rulePattern(text: string): ReceiptVisualRule["pattern"] {
  const compact = compactRule(text);
  const dots = (compact.match(/[.·•]/g) || []).length;
  const dashes = (compact.match(/[\-—–]/g) || []).length;
  if (dots / Math.max(1, compact.length) >= 0.62) return "dotted";
  if (dashes / Math.max(1, compact.length) >= 0.62) return "dashed";
  return "solid";
}

/**
 * Conserva la geometría física de los separadores que Tesseract detectó.
 * La reconstrucción anterior dibujaba todas las reglas casi de borde a borde,
 * aunque el ticket original tuviera una línea corta, centrada o desplazada.
 */
export function buildReceiptVisualRules(layout: ReceiptVisualLayoutInput): ReceiptVisualRule[] {
  const width = Math.max(1, Number(layout.bounds.width) || 1);
  const height = Math.max(1, Number(layout.bounds.height) || 1);
  const textHeights = layout.lines
    .filter((line) => !isReceiptRuleLine(line) && Number.isFinite(line.height) && line.height > 0)
    .map((line) => line.height / 100 * height)
    .sort((a, b) => a - b);
  const medianHeight = textHeights.length
    ? textHeights[Math.floor(textHeights.length / 2)]
    : Math.max(1, height * 0.02);

  return layout.lines.flatMap((line) => {
    if (!isReceiptRuleLine(line)) return [];
    const x1 = clamp(line.left / 100 * width, 0, width);
    const x2 = clamp((line.left + line.width) / 100 * width, x1, width);
    const y = clamp((line.top + line.height / 2) / 100 * height, 0, height);
    const measuredHeight = Math.max(0.5, line.height / 100 * height);
    const strokeWidth = clamp(measuredHeight * 0.16, 0.45, Math.max(0.55, medianHeight * 0.12));
    if (x2 - x1 < Math.max(4, width * 0.025)) return [];
    return [{ x1, x2, y, strokeWidth, pattern: rulePattern(line.text) }];
  }).sort((a, b) => a.y - b.y || a.x1 - b.x1);
}
