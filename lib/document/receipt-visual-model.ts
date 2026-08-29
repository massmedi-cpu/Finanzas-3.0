export type ReceiptVisualLineInput = {
  text: string;
  score: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ReceiptVisualLayoutInput = {
  bounds: { width: number; height: number };
  lines: ReceiptVisualLineInput[];
};

type NativeToken = ReceiptVisualLineInput & {
  index: number;
  x: number;
  y: number;
  boxWidth: number;
  boxHeight: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
};

type Row = {
  tokens: NativeToken[];
  top: number;
  bottom: number;
  left: number;
  right: number;
  centerY: number;
};

export type ReceiptVisualToken = NativeToken & {
  rowIndex: number;
  renderX: number;
  baselineY: number;
  fontSize: number;
  fontWeight: 500 | 600 | 700;
  textAnchor: "start" | "middle" | "end";
  letterSpacing: number;
  textLength?: number;
};

export type ReceiptVisualModel = {
  width: number;
  height: number;
  medianHeight: number;
  tokens: ReceiptVisualToken[];
  rules: number[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function numericLike(text: string) {
  const compact = text.trim().replace(/\s+/g, "");
  return /^[€$£]?[+-]?(?:\d+[\d.,']*|[.,]\d+)%?$/.test(compact);
}

function ruleLike(text: string) {
  const compact = text.replace(/\s/g, "");
  return compact.length >= 5 && /^[\-_.=·•]+$/.test(compact);
}

function verticalOverlap(token: NativeToken, row: Row) {
  const overlap = Math.max(0, Math.min(token.bottom, row.bottom) - Math.max(token.y, row.top));
  return overlap / Math.max(1, Math.min(token.boxHeight, row.bottom - row.top));
}

function buildRows(tokens: NativeToken[], medianHeight: number) {
  const rows: Row[] = [];
  for (const token of [...tokens].sort((a, b) => a.centerY - b.centerY || a.x - b.x)) {
    let target: Row | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows.slice(-6)) {
      const distance = Math.abs(token.centerY - row.centerY);
      const rowHeight = Math.max(1, row.bottom - row.top);
      const tolerance = Math.max(medianHeight * 0.34, Math.min(token.boxHeight, rowHeight) * 0.5);
      if ((verticalOverlap(token, row) >= 0.55 || distance <= tolerance) && distance < bestDistance) {
        target = row;
        bestDistance = distance;
      }
    }
    if (!target) {
      rows.push({
        tokens: [token],
        top: token.y,
        bottom: token.bottom,
        left: token.x,
        right: token.right,
        centerY: token.centerY,
      });
      continue;
    }
    target.tokens.push(token);
    target.tokens.sort((a, b) => a.x - b.x);
    target.top = Math.min(target.top, token.y);
    target.bottom = Math.max(target.bottom, token.bottom);
    target.left = Math.min(target.left, token.x);
    target.right = Math.max(target.right, token.right);
    target.centerY = median(target.tokens.map((item) => item.centerY));
  }
  return rows.sort((a, b) => a.top - b.top || a.left - b.left);
}

function nearestDistance(token: NativeToken, tokens: NativeToken[]) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const candidate of tokens) {
    if (candidate.index === token.index) continue;
    const dx = candidate.centerX - token.centerX;
    const dy = candidate.centerY - token.centerY;
    nearest = Math.min(nearest, Math.hypot(dx, dy));
  }
  return nearest;
}

function removeGeometricNoise(tokens: NativeToken[], medianHeight: number) {
  if (tokens.length < 3) return tokens;
  return tokens.filter((token) => {
    const visible = token.text.replace(/\s/g, "");
    if (!visible || token.score < 15) return false;
    if (visible.length !== 1 || token.score >= 60) return true;
    const tiny = token.boxWidth <= medianHeight * 0.72 && token.boxHeight <= medianHeight * 0.92;
    if (!tiny) return true;
    return nearestDistance(token, tokens) <= medianHeight * 3.6;
  });
}

type AnchorCluster = { center: number; values: number[]; rows: Set<number> };

function stableAnchors(values: Array<{ value: number; row: number }>, tolerance: number, minimumRows: number) {
  const clusters: AnchorCluster[] = [];
  for (const entry of [...values].sort((a, b) => a.value - b.value)) {
    let cluster = clusters.find((candidate) => Math.abs(candidate.center - entry.value) <= tolerance);
    if (!cluster) {
      cluster = { center: entry.value, values: [], rows: new Set<number>() };
      clusters.push(cluster);
    }
    cluster.values.push(entry.value);
    cluster.rows.add(entry.row);
    cluster.center = median(cluster.values);
  }
  return clusters.filter((cluster) => cluster.rows.size >= minimumRows).map((cluster) => cluster.center);
}

function nearestAnchor(value: number, anchors: number[], tolerance: number) {
  let best = value;
  let distance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const candidate = Math.abs(anchor - value);
    if (candidate < distance && candidate <= tolerance) {
      best = anchor;
      distance = candidate;
    }
  }
  return best;
}

function approximateMonospaceWidth(text: string, fontSize: number) {
  return Array.from(text).length * fontSize * 0.605;
}

export function buildReceiptVisualModel(layout: ReceiptVisualLayoutInput): ReceiptVisualModel {
  const width = Math.max(1, Number(layout.bounds.width) || 1);
  const height = Math.max(1, Number(layout.bounds.height) || 1);
  const rawTokens: NativeToken[] = layout.lines
    .map((line, index) => {
      const x = line.left / 100 * width;
      const y = line.top / 100 * height;
      const boxWidth = Math.max(0.5, line.width / 100 * width);
      const boxHeight = Math.max(0.5, line.height / 100 * height);
      return {
        ...line,
        index,
        x,
        y,
        boxWidth,
        boxHeight,
        right: x + boxWidth,
        bottom: y + boxHeight,
        centerX: x + boxWidth / 2,
        centerY: y + boxHeight / 2,
      };
    })
    .filter((token) => token.text.trim() && Number.isFinite(token.x) && Number.isFinite(token.y));

  const initialMedianHeight = Math.max(1, median(rawTokens.map((token) => token.boxHeight)) || 1);
  const tokens = removeGeometricNoise(rawTokens, initialMedianHeight);
  const medianHeight = Math.max(1, median(tokens.map((token) => token.boxHeight)) || initialMedianHeight);
  const rules = tokens
    .filter((token) => ruleLike(token.text))
    .map((token) => token.centerY)
    .sort((a, b) => a - b);
  const contentTokens = tokens.filter((token) => !ruleLike(token.text));
  const rows = buildRows(contentTokens, medianHeight);

  const tabularRows = new Set<number>();
  rows.forEach((row, rowIndex) => {
    const numeric = row.tokens.filter((token) => numericLike(token.text));
    const largeGap = row.tokens.some((token, index) => index > 0 && token.x - row.tokens[index - 1].right > medianHeight * 1.45);
    if (row.tokens.length >= 2 && (numeric.length > 0 || largeGap)) tabularRows.add(rowIndex);
  });

  const rightCandidates: Array<{ value: number; row: number }> = [];
  const leftCandidates: Array<{ value: number; row: number }> = [];
  rows.forEach((row, rowIndex) => {
    if (!tabularRows.has(rowIndex)) return;
    row.tokens.forEach((token) => {
      if (numericLike(token.text) && token.centerX >= width * 0.35) rightCandidates.push({ value: token.right, row: rowIndex });
      else leftCandidates.push({ value: token.x, row: rowIndex });
    });
  });
  const rightTolerance = Math.max(width * 0.018, medianHeight * 0.9);
  const leftTolerance = Math.max(width * 0.014, medianHeight * 0.75);
  const rightAnchors = stableAnchors(rightCandidates, rightTolerance, 2);
  const leftAnchors = stableAnchors(leftCandidates, leftTolerance, 2);

  const result: ReceiptVisualToken[] = [];
  rows.forEach((row, rowIndex) => {
    const rowHeights = row.tokens.map((token) => token.boxHeight);
    const rowHeight = Math.max(1, median(rowHeights) || medianHeight);
    const relativeHeight = rowHeight / medianHeight;
    const fontSize = clamp(rowHeight * 0.82, medianHeight * 0.64, medianHeight * 1.55);
    const fontWeight: 500 | 600 | 700 = relativeHeight >= 1.24 ? 700 : relativeHeight >= 1.1 ? 600 : 500;
    const baselineY = median(row.tokens.map((token) => token.centerY)) + fontSize * 0.34;
    const rowCenter = (row.left + row.right) / 2;
    const rowSpan = Math.max(1, row.right - row.left);
    const centerDistance = Math.abs(rowCenter - width / 2);
    const centered = !tabularRows.has(rowIndex) && rowSpan <= width * 0.78 && centerDistance <= Math.max(width * 0.045, medianHeight * 1.35);
    const leftMargin = row.left;
    const rightMargin = width - row.right;
    const rightAligned = !tabularRows.has(rowIndex) && !centered && rowSpan <= width * 0.64 && rightMargin < leftMargin * 0.42;
    const centerShift = centered ? width / 2 - rowCenter : 0;

    for (const token of row.tokens) {
      let renderX = token.x + centerShift;
      let textAnchor: "start" | "middle" | "end" = "start";
      let targetWidth = token.boxWidth;

      if (tabularRows.has(rowIndex) && numericLike(token.text) && token.centerX >= width * 0.35) {
        const anchoredRight = nearestAnchor(token.right, rightAnchors, rightTolerance * 1.35);
        renderX = anchoredRight;
        textAnchor = "end";
      } else if (tabularRows.has(rowIndex)) {
        renderX = nearestAnchor(token.x, leftAnchors, leftTolerance * 1.35);
      } else if (rightAligned) {
        renderX = token.x + (width - rightMargin - row.right);
      }

      const naturalWidth = Math.max(1, approximateMonospaceWidth(token.text, fontSize));
      const fitRatio = targetWidth / naturalWidth;
      const characters = Math.max(1, Array.from(token.text).length);
      const rawTracking = characters > 1 ? (targetWidth - naturalWidth) / (characters - 1) : 0;
      const letterSpacing = fitRatio >= 0.88 && fitRatio <= 1.12
        ? clamp(rawTracking, -fontSize * 0.035, fontSize * 0.035)
        : 0;
      const safeTextLength = characters > 1 && fitRatio >= 0.985 && fitRatio <= 1.015 ? targetWidth : undefined;

      result.push({
        ...token,
        rowIndex,
        renderX,
        baselineY,
        fontSize,
        fontWeight,
        textAnchor,
        letterSpacing,
        textLength: safeTextLength,
      });
    }
  });

  return {
    width,
    height,
    medianHeight,
    tokens: result.sort((a, b) => a.rowIndex - b.rowIndex || a.x - b.x),
    rules,
  };
}
