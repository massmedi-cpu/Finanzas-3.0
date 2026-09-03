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
  center: number;
  supportRatio: number;
  rowCount: number;
  verticalExtent: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

/**
 * Infiere el corredor horizontal del cuerpo del ticket cuando no existe una
 * cabecera semántica de tabla. Se basa únicamente en la repetición geométrica
 * de filas alrededor de un mismo eje, por lo que funciona con tickets de bar,
 * comercio, parking o cualquier otro formato sin vocabulario específico.
 *
 * Falla de forma cerrada: si no hay un grupo dominante, suficiente número de
 * filas o continuidad vertical, devuelve null y el OCR conserva la evidencia.
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

  const top = Math.min(...bestRows.map((row) => row.top));
  const bottom = Math.max(...bestRows.map((row) => row.bottom));
  const verticalExtent = bottom - top;
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

  return {
    left,
    right,
    center: bestCenter,
    supportRatio: Math.round(supportRatio * 1000) / 1000,
    rowCount: bestRows.length,
    verticalExtent,
  };
}
