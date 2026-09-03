import type { ReceiptVisualLayoutInput, ReceiptVisualLineInput } from "./receipt-visual-model";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

type Sample = { index: number; centerX: number; centerY: number; height: number };

function samples(layout: ReceiptVisualLayoutInput) {
  const width = Math.max(1, Number(layout.bounds.width) || 1);
  const height = Math.max(1, Number(layout.bounds.height) || 1);
  return layout.lines.map((line, index): Sample => {
    const boxWidth = Math.max(0.5, line.width / 100 * width);
    const boxHeight = Math.max(0.5, line.height / 100 * height);
    const left = line.left / 100 * width;
    const top = line.top / 100 * height;
    return { index, centerX: left + boxWidth / 2, centerY: top + boxHeight / 2, height: boxHeight };
  });
}

function inferResidualSlope(layout: ReceiptVisualLayoutInput) {
  const width = Math.max(1, Number(layout.bounds.width) || 1);
  const points = samples(layout);
  if (points.length < 8) return 0;
  const medianHeight = Math.max(1, median(points.map((point) => point.height)) || 1);
  const minHorizontalSeparation = Math.max(width * 0.1, medianHeight * 3.2);
  const candidateSlopes: number[] = [];

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const dx = b.centerX - a.centerX;
      if (Math.abs(dx) < minHorizontalSeparation) continue;
      const dy = b.centerY - a.centerY;
      if (Math.abs(dy) > medianHeight * 0.92) continue;
      const heightRatio = Math.max(a.height, b.height) / Math.max(1, Math.min(a.height, b.height));
      if (heightRatio > 1.8) continue;
      const slope = dy / dx;
      if (Math.abs(slope) <= 0.11) candidateSlopes.push(slope);
    }
  }

  if (candidateSlopes.length < 6) return 0;
  const rough = median(candidateSlopes);
  const medianDeviation = median(candidateSlopes.map((slope) => Math.abs(slope - rough)));
  const tolerance = Math.max(0.012, medianDeviation * 2.8);
  const inliers = candidateSlopes.filter((slope) => Math.abs(slope - rough) <= tolerance);
  if (inliers.length < 6 || inliers.length / candidateSlopes.length < 0.55) return 0;
  const slope = median(inliers);
  if (Math.abs(slope) < 0.008 || Math.abs(slope) > 0.085) return 0;
  return slope;
}

export function normalizeReceiptRowPerspective<T extends ReceiptVisualLayoutInput>(layout: T): T {
  const width = Math.max(1, Number(layout.bounds.width) || 1);
  const height = Math.max(1, Number(layout.bounds.height) || 1);
  const slope = inferResidualSlope(layout);
  if (!slope) return layout;

  const points = samples(layout);
  const medianHeight = Math.max(1, median(points.map((point) => point.height)) || 1);
  const maxCorrection = medianHeight * 0.68;
  const centerX = width / 2;
  const lines = layout.lines.map((line: ReceiptVisualLineInput, index) => {
    const correction = clamp(slope * (points[index].centerX - centerX), -maxCorrection, maxCorrection);
    return { ...line, top: (line.top / 100 * height - correction) / height * 100 };
  });
  return { ...layout, lines } as T;
}
