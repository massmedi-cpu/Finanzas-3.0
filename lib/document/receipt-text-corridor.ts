export type ReceiptCorridorRow = {
  text: string;
  score: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ReceiptTextCorridor = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  center: number;
  supportRatio: number;
  rowCount: number;
  verticalExtent: number;
  verticalLimited: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * clamp(ratio, 0, 1))];
}

function visibleLength(value: string) {
  return Array.from(value.replace(/\s/g, "")).length;
}

function rowWeight(row: ReceiptCorridorRow) {
  return clamp(visibleLength(row.text), 2, 36) * (0.55 + clamp(row.score, 0, 100) / 200);
}

function supportsCenter(row: ReceiptCorridorRow, center: number, window: number) {
  const rowCenter = (row.left + row.right) / 2;
  return Math.abs(rowCenter - center) <= window || (row.left <= center && row.right >= center);
}

function safeVerticalEnvelope(rows: ReceiptCorridorRow[], sourceHeight: number) {
  const ordered = [...rows].sort((a, b) => a.top - b.top || a.left - b.left);
  if (ordered.length < 6) return { top: 0, bottom: sourceHeight, limited: false };

  const medianHeight = Math.max(1, median(ordered.map((row) => row.bottom - row.top)));
  const gapThreshold = Math.max(sourceHeight * 0.11, medianHeight * 7);
  let topIndex = 0;
  let bottomIndex = ordered.length - 1;
  let limited = false;

  // Solo se elimina una fila extrema aislada. Para evitar confundir una
  // cabecera/pie real con fondo, además debe estar cerca del borde de la foto y
  // separada del cuerpo por un hueco claramente anómalo.
  const first = ordered[0];
  const second = ordered[1];
  const topGap = second.top - first.bottom;
  if (
    ordered.length - 1 >= 5
    && first.bottom <= sourceHeight * 0.18
    && topGap >= gapThreshold
  ) {
    topIndex = 1;
    limited = true;
  }

  const last = ordered.at(-1)!;
  const beforeLast = ordered.at(-2)!;
  const bottomGap = last.top - beforeLast.bottom;
  if (
    bottomIndex - topIndex >= 5
    && last.top >= sourceHeight * 0.82
    && bottomGap >= gapThreshold
  ) {
    bottomIndex -= 1;
    limited = true;
  }

  if (!limited) return { top: 0, bottom: sourceHeight, limited: false };

  const core = ordered.slice(topIndex, bottomIndex + 1);
  if (core.length < 5) return { top: 0, bottom: sourceHeight, limited: false };
  const coreTop = Math.min(...core.map((row) => row.top));
  const coreBottom = Math.max(...core.map((row) => row.bottom));
  const coreExtent = Math.max(1, coreBottom - coreTop);
  const margin = Math.max(sourceHeight * 0.035, medianHeight * 4, coreExtent * 0.055);

  return {
    top: topIndex > 0 ? clamp(coreTop - margin, 0, sourceHeight) : 0,
    bottom: bottomIndex < ordered.length - 1 ? clamp(coreBottom + margin, 0, sourceHeight) : sourceHeight,
    limited: true,
  };
}

/**
 * Infiere el corredor del cuerpo del ticket cuando no existe una cabecera
 * semántica de tabla. Se basa únicamente en la repetición geométrica de filas
 * alrededor de un mismo eje, por lo que funciona con tickets de bar, comercio,
 * parking o cualquier otro formato sin vocabulario específico.
 *
 * Falla de forma cerrada: si no hay un grupo dominante, suficiente número de
 * filas o continuidad, devuelve null y el OCR conserva la evidencia.
 */
export function inferReceiptTextCorridor(
  rows: ReceiptCorridorRow[],
  sourceWidth: number,
  sourceHeight: number,
): ReceiptTextCorridor | null {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) return null;

  const candidates = rows.filter((row) => {
    const width = row.right - row.left;
    return visibleLength(row.text) >= 2
      && row.score >= 38
      && Number.isFinite(row.left)
      && Number.isFinite(row.right)
      && Number.isFinite(row.top)
      && Number.isFinite(row.bottom)
      && width >= sourceWidth * 0.025
      && width <= sourceWidth * 0.94
      && row.bottom > row.top;
  });
  if (candidates.length < 5) return null;

  const totalWeight = candidates.reduce((sum, row) => sum + rowWeight(row), 0);
  if (totalWeight <= 0) return null;

  const window = Math.max(36, sourceWidth * 0.17);
  let bestCenter = sourceWidth / 2;
  let bestWeight = 0;
  let bestRows: ReceiptCorridorRow[] = [];

  for (const seed of candidates) {
    const center = (seed.left + seed.right) / 2;
    const supported = candidates.filter((row) => supportsCenter(row, center, window));
    const weight = supported.reduce((sum, row) => sum + rowWeight(row), 0);
    if (weight > bestWeight) {
      bestWeight = weight;
      bestCenter = center;
      bestRows = supported;
    }
  }

  const supportRatio = bestWeight / totalWeight;
  if (bestRows.length < 5 || supportRatio < 0.52) return null;

  const refinedWeight = bestRows.reduce((sum, row) => sum + rowWeight(row), 0);
  const refinedCenter = bestRows.reduce(
    (sum, row) => sum + ((row.left + row.right) / 2) * rowWeight(row),
    0,
  ) / Math.max(1, refinedWeight);
  bestCenter = clamp(refinedCenter, 0, sourceWidth);
  bestRows = candidates.filter((row) => supportsCenter(row, bestCenter, window));

  const rawTop = Math.min(...bestRows.map((row) => row.top));
  const rawBottom = Math.max(...bestRows.map((row) => row.bottom));
  const verticalExtent = rawBottom - rawTop;
  if (bestRows.length < 5 || verticalExtent < sourceHeight * 0.22) return null;

  // Una frase o cartel ancho del fondo puede cruzar el eje del ticket y, por
  // tanto, pertenecer al grupo central. No permitimos que una anchura aislada
  // defina los bordes físicos: se compara con el cuartil alto del propio grupo.
  // Esa fila no se elimina aquí; simplemente deja de ensanchar el corredor.
  const widths = bestRows.map((row) => row.right - row.left);
  const widthReference = quantile(widths, 0.75);
  const maximumEdgeWidth = Math.max(sourceWidth * 0.34, widthReference * 1.6);
  const edgeRows = bestRows.filter((row) => row.right - row.left <= maximumEdgeWidth);
  if (edgeRows.length < 4) return null;

  let left = quantile(edgeRows.map((row) => row.left), 0.08);
  let right = quantile(edgeRows.map((row) => row.right), 0.92);
  let width = right - left;
  if (width <= 0) return null;

  const minimumWidth = sourceWidth * 0.22;
  if (width < minimumWidth) {
    left = bestCenter - minimumWidth / 2;
    right = bestCenter + minimumWidth / 2;
    width = minimumWidth;
  }

  const margin = Math.max(sourceWidth * 0.025, width * 0.08);
  left = clamp(left - margin, 0, sourceWidth);
  right = clamp(right + margin, 0, sourceWidth);
  width = right - left;

  // Si el corredor ocupa prácticamente toda la imagen no aporta aislamiento y
  // sería peligroso fingir una detección que no discrimina fondo de ticket.
  if (width < sourceWidth * 0.22 || width > sourceWidth * 0.94) return null;

  const vertical = safeVerticalEnvelope(bestRows, sourceHeight);
  return {
    left,
    right,
    top: vertical.top,
    bottom: vertical.bottom,
    center: bestCenter,
    supportRatio: Math.round(supportRatio * 1000) / 1000,
    rowCount: bestRows.length,
    verticalExtent,
    verticalLimited: vertical.limited,
  };
}
