import type { ReceiptVisualLayoutInput } from "./receipt-visual-model";

export type ReceiptPhysicalLayoutInput = ReceiptVisualLayoutInput & {
  sourceWidth?: number;
  sourceHeight?: number;
  bounds: ReceiptVisualLayoutInput["bounds"] & {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
  };
};

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Reproyecta el layout OCR desde el recorte de texto al papel físico completo
 * cuando la evidencia persistida demuestra que ambos espacios son cercanos.
 *
 * Así se recuperan márgenes superiores, inferiores y laterales reales que la
 * antigua preview eliminaba al usar solo visualBounds(texto). Si source/bounds
 * difieren demasiado, se conserva el layout estrecho para no reintroducir el
 * fondo de una fotografía donde el papel no quedó aislado.
 */
export function receiptPhysicalPreviewLayout(layout: ReceiptPhysicalLayoutInput): ReceiptVisualLayoutInput {
  const sourceWidth = layout.sourceWidth;
  const sourceHeight = layout.sourceHeight;
  const boundsWidth = layout.bounds.width;
  const boundsHeight = layout.bounds.height;
  const left = layout.bounds.left;
  const top = layout.bounds.top;

  if (!finitePositive(sourceWidth)
    || !finitePositive(sourceHeight)
    || !finitePositive(boundsWidth)
    || !finitePositive(boundsHeight)
    || typeof left !== "number"
    || typeof top !== "number"
    || !Number.isFinite(left)
    || !Number.isFinite(top)) return layout;

  const widthCoverage = boundsWidth / sourceWidth;
  const heightCoverage = boundsHeight / sourceHeight;
  const sourceAspect = sourceHeight / sourceWidth;
  const plausiblePaperSpace = widthCoverage >= 0.52
    && heightCoverage >= 0.35
    && widthCoverage <= 1.001
    && heightCoverage <= 1.001
    && sourceAspect >= 0.65
    && sourceAspect <= 8
    && sourceWidth / boundsWidth <= 1.6
    && sourceHeight / boundsHeight <= 1.85;
  if (!plausiblePaperSpace) return layout;

  return {
    bounds: { width: sourceWidth, height: sourceHeight },
    lines: layout.lines.map((line) => {
      const absoluteLeft = left + line.left / 100 * boundsWidth;
      const absoluteTop = top + line.top / 100 * boundsHeight;
      const absoluteWidth = line.width / 100 * boundsWidth;
      const absoluteHeight = line.height / 100 * boundsHeight;
      return {
        ...line,
        left: clamp(absoluteLeft / sourceWidth * 100, 0, 100),
        top: clamp(absoluteTop / sourceHeight * 100, 0, 100),
        width: clamp(absoluteWidth / sourceWidth * 100, 0, 100),
        height: clamp(absoluteHeight / sourceHeight * 100, 0, 100),
      };
    }),
  };
}
