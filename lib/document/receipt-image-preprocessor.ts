export type PreparedReceiptImage = {
  adaptive: HTMLCanvasElement;
  grayscale: HTMLCanvasElement;
  deskewAngle: number;
  perspectiveCorrected: boolean;
  paperDetected: boolean;
  durationMs: number;
};

type PaperGeometry = {
  top: number;
  bottom: number;
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
};

type PaperSpan = {
  y: number;
  left: number;
  right: number;
  meanLuminance: number;
};

type PaperTrack = {
  spans: PaperSpan[];
  lastGridRow: number;
};

type PaperEdgeLine = {
  center: number;
  slope: number;
  score: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const quantile = (values: number[], ratio: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * clamp(ratio, 0, 1))];
};

function neutralLuminance(red: number, green: number, blue: number) {
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  return { luminance, chroma: high - low };
}

/**
 * Detecta un único componente físico de papel, no la unión de todos los píxeles
 * claros de la fotografía. Esto evita incorporar carteles, pantallas, sobres u
 * otras superficies claras con texto que estén detrás del ticket.
 */
function detectPaperFromLightRuns(data: ImageData, width: number, height: number): PaperGeometry | null {
  const step = Math.max(4, Math.floor(Math.max(width, height) / 700));
  const rows = Math.ceil(height / step);
  const columns = Math.ceil(width / step);

  // Umbral adaptado a la iluminación de la foto. Solo se calcula con muestras
  // relativamente neutras para no confundir superficies de color con papel.
  const neutralSamples: number[] = [];
  const sampleStrideY = Math.max(1, Math.floor(rows / 90));
  const sampleStrideX = Math.max(1, Math.floor(columns / 90));
  for (let gridY = 0; gridY < rows; gridY += sampleStrideY) {
    const y = Math.min(height - 1, gridY * step);
    for (let gridX = 0; gridX < columns; gridX += sampleStrideX) {
      const x = Math.min(width - 1, gridX * step);
      const offset = (y * width + x) * 4;
      const sample = neutralLuminance(data.data[offset], data.data[offset + 1], data.data[offset + 2]);
      if (sample.chroma <= 90) neutralSamples.push(sample.luminance);
    }
  }
  const luminanceThreshold = clamp(Math.round(quantile(neutralSamples, 0.65) + 18), 140, 205);
  const maxGapCells = Math.max(1, Math.round(columns * 0.012));
  const minimumRunWidth = Math.max(step * 4, Math.round(width * 0.22));
  const rowRuns: PaperSpan[][] = [];

  for (let gridY = 0; gridY < rows; gridY += 1) {
    const y = Math.min(height - 1, gridY * step);
    const points: Array<{ gridX: number; x: number; luminance: number }> = [];

    for (let gridX = 0; gridX < columns; gridX += 1) {
      const x = Math.min(width - 1, gridX * step);
      const offset = (y * width + x) * 4;
      const sample = neutralLuminance(data.data[offset], data.data[offset + 1], data.data[offset + 2]);
      if (sample.luminance >= luminanceThreshold && sample.chroma <= 72) {
        points.push({ gridX, x, luminance: sample.luminance });
      }
    }

    const runs: PaperSpan[] = [];
    for (let start = 0; start < points.length;) {
      let end = start;
      while (end + 1 < points.length && points[end + 1].gridX - points[end].gridX <= maxGapCells + 1) end += 1;
      const group = points.slice(start, end + 1);
      const left = group[0]?.x ?? 0;
      const right = group.at(-1)?.x ?? left;
      const gridSlots = Math.max(1, (group.at(-1)?.gridX ?? 0) - (group[0]?.gridX ?? 0) + 1);
      const density = group.length / gridSlots;
      if (right - left >= minimumRunWidth && density >= 0.5) {
        runs.push({
          y,
          left,
          right,
          meanLuminance: group.reduce((sum, point) => sum + point.luminance, 0) / Math.max(1, group.length),
        });
      }
      start = end + 1;
    }
    rowRuns.push(runs);
  }

  // Une únicamente franjas que pertenecen al mismo componente continuo. El
  // detector anterior tomaba el mínimo/máximo de cada fila y podía fusionar
  // el ticket con una imagen clara situada al fondo.
  const tracks: PaperTrack[] = [];
  for (let gridY = 0; gridY < rowRuns.length; gridY += 1) {
    const usedTracks = new Set<number>();
    for (const run of rowRuns[gridY]) {
      const runWidth = Math.max(1, run.right - run.left);
      const runCenter = (run.left + run.right) / 2;
      let bestTrack = -1;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (let index = 0; index < tracks.length; index += 1) {
        if (usedTracks.has(index)) continue;
        const track = tracks[index];
        if (gridY - track.lastGridRow > 4) continue;
        const previous = track.spans.at(-1);
        if (!previous) continue;
        const previousWidth = Math.max(1, previous.right - previous.left);
        const widthRatio = Math.max(runWidth, previousWidth) / Math.max(1, Math.min(runWidth, previousWidth));
        if (widthRatio > 1.7) continue;

        const overlap = Math.max(0, Math.min(run.right, previous.right) - Math.max(run.left, previous.left));
        const overlapRatio = overlap / Math.max(1, Math.min(runWidth, previousWidth));
        const previousCenter = (previous.left + previous.right) / 2;
        const centerDelta = Math.abs(runCenter - previousCenter) / Math.max(runWidth, previousWidth);
        if (overlapRatio < 0.22 && centerDelta > 0.34) continue;

        const score = overlapRatio - centerDelta * 0.8;
        if (score > bestScore) {
          bestScore = score;
          bestTrack = index;
        }
      }

      if (bestTrack < 0) {
        tracks.push({ spans: [run], lastGridRow: gridY });
        usedTracks.add(tracks.length - 1);
      } else {
        tracks[bestTrack].spans.push(run);
        tracks[bestTrack].lastGridRow = gridY;
        usedTracks.add(bestTrack);
      }
    }
  }

  const candidates = tracks.flatMap((track) => {
    const spans = track.spans;
    if (spans.length < rows * 0.18) return [];
    const top = spans[0].y;
    const bottom = spans.at(-1)!.y;
    const verticalExtent = bottom - top;
    if (verticalExtent < height * 0.38) return [];

    const widths = spans.map((span) => span.right - span.left);
    const medianWidth = median(widths);
    if (medianWidth < width * 0.24) return [];
    const expectedRows = verticalExtent / step + 1;
    const coverage = spans.length / Math.max(1, expectedRows);
    if (coverage < 0.52) return [];

    const widthQ10 = quantile(widths, 0.1);
    const widthQ90 = quantile(widths, 0.9);
    if (widthQ90 / Math.max(1, widthQ10) > 1.6) return [];

    const whiteness = median(spans.map((span) => span.meanLuminance)) / 255;
    const center = median(spans.map((span) => (span.left + span.right) / 2));
    const centerBonus = 1 - Math.min(1, Math.abs(center - width / 2) / Math.max(1, width / 2));
    const aspect = verticalExtent / Math.max(1, medianWidth);
    const medianLeft = median(spans.map((span) => span.left));
    const medianRight = median(spans.map((span) => span.right));

    // Una superficie que llega al borde de la fotografía es mucho más probable
    // que sea el fondo que el ticket fotografiado. Se penaliza, pero no se
    // rechaza de forma absoluta para mantener el fallback en fotos recortadas.
    const borderTouches = Number(top < height * 0.025)
      + Number(bottom > height * 0.975)
      + Number(medianLeft < width * 0.025)
      + Number(medianRight > width * 0.975);

    const score = verticalExtent / height * 3
      + coverage * 2
      + whiteness * 1.2
      + Math.min(1.5, aspect) * 0.55
      + centerBonus * 0.45
      + medianWidth / width * 0.25
      - borderTouches * 0.95;

    return [{ track, score }];
  }).sort((a, b) => b.score - a.score);

  const best = candidates[0]?.track;
  if (!best) return null;
  const spans = best.spans;
  const top = spans[0].y;
  const bottom = spans.at(-1)!.y;
  const band = Math.max(4, Math.round(spans.length * 0.14));
  const topBand = spans.slice(0, band);
  const bottomBand = spans.slice(-band);
  const topLeft = median(topBand.map((span) => span.left));
  const topRight = median(topBand.map((span) => span.right));
  const bottomLeft = median(bottomBand.map((span) => span.left));
  const bottomRight = median(bottomBand.map((span) => span.right));
  const topWidth = topRight - topLeft;
  const bottomWidth = bottomRight - bottomLeft;
  if (Math.min(topWidth, bottomWidth) < width * 0.24) return null;
  const ratio = Math.max(topWidth, bottomWidth) / Math.max(1, Math.min(topWidth, bottomWidth));
  if (ratio > 1.6) return null;
  return { top, bottom, topLeft, topRight, bottomLeft, bottomRight };
}

function strongestEdgeLine(
  signal: Float32Array,
  gridWidth: number,
  gridHeight: number,
  startRatio: number,
  endRatio: number,
): PaperEdgeLine | null {
  const yStart = Math.round(gridHeight * 0.04);
  const yEnd = Math.round(gridHeight * 0.96);
  let best: PaperEdgeLine | null = null;

  for (let slope = -0.18; slope <= 0.1801; slope += 0.02) {
    for (let center = Math.round(gridWidth * startRatio); center <= Math.round(gridWidth * endRatio); center += 1) {
      let score = 0;
      for (let y = yStart; y < yEnd; y += 1) {
        const projected = Math.round(center + slope * (y - gridHeight / 2));
        let strongest = 0;
        for (let delta = -1; delta <= 1; delta += 1) {
          const x = projected + delta;
          if (x >= 0 && x < gridWidth) strongest = Math.max(strongest, signal[y * gridWidth + x]);
        }
        score += strongest;
      }
      score /= Math.max(1, yEnd - yStart);
      if (!best || score > best.score) best = { center, slope, score };
    }
  }

  return best;
}

function lineX(line: PaperEdgeLine, y: number, gridHeight: number) {
  return line.center + line.slope * (y - gridHeight / 2);
}

/**
 * Fallback geométrico para tickets grises, arrugados o apoyados sobre otra
 * superficie clara. Busca dos bordes largos y de polaridad opuesta: entrada al
 * papel por la izquierda y salida por la derecha. El texto del fondo produce
 * trazos cortos, pero no dos líneas paralelas durante casi toda la fotografía.
 */
function detectPaperFromLongEdges(data: ImageData, width: number, height: number): PaperGeometry | null {
  const step = clamp(Math.round(Math.max(width, height) / 500), 3, 8);
  const gridWidth = Math.ceil(width / step);
  const gridHeight = Math.ceil(height / step);
  if (gridWidth < 80 || gridHeight < 100) return null;

  const luminance = new Float32Array(gridWidth * gridHeight);
  for (let y = 0; y < gridHeight; y += 1) {
    const sourceY = Math.min(height - 1, y * step);
    for (let x = 0; x < gridWidth; x += 1) {
      const sourceX = Math.min(width - 1, x * step);
      const offset = (sourceY * width + sourceX) * 4;
      luminance[y * gridWidth + x] = data.data[offset] * 0.2126
        + data.data[offset + 1] * 0.7152
        + data.data[offset + 2] * 0.0722;
    }
  }

  const integralWidth = gridWidth + 1;
  const integral = new Float64Array(integralWidth * (gridHeight + 1));
  for (let y = 1; y <= gridHeight; y += 1) {
    let row = 0;
    for (let x = 1; x <= gridWidth; x += 1) {
      row += luminance[(y - 1) * gridWidth + x - 1];
      integral[y * integralWidth + x] = integral[(y - 1) * integralWidth + x] + row;
    }
  }

  const mean = (left: number, top: number, right: number, bottom: number) => {
    const x1 = clamp(left, 0, gridWidth - 1);
    const x2 = clamp(right, x1 + 1, gridWidth);
    const y1 = clamp(top, 0, gridHeight - 1);
    const y2 = clamp(bottom, y1 + 1, gridHeight);
    const sum = integral[y2 * integralWidth + x2]
      - integral[y1 * integralWidth + x2]
      - integral[y2 * integralWidth + x1]
      + integral[y1 * integralWidth + x1];
    return sum / Math.max(1, (x2 - x1) * (y2 - y1));
  };

  const positive = new Float32Array(gridWidth * gridHeight);
  const negative = new Float32Array(gridWidth * gridHeight);
  const window = 4;
  const gap = 1;
  const verticalRadius = 2;
  for (let y = verticalRadius; y < gridHeight - verticalRadius; y += 1) {
    for (let x = window + gap; x < gridWidth - window - gap; x += 1) {
      const before = mean(x - gap - window, y - verticalRadius, x - gap, y + verticalRadius + 1);
      const after = mean(x + gap, y - verticalRadius, x + gap + window, y + verticalRadius + 1);
      const difference = after - before;
      positive[y * gridWidth + x] = Math.max(0, difference);
      negative[y * gridWidth + x] = Math.max(0, -difference);
    }
  }

  const left = strongestEdgeLine(positive, gridWidth, gridHeight, 0.025, 0.55);
  const right = strongestEdgeLine(negative, gridWidth, gridHeight, 0.45, 0.975);
  if (!left || !right || left.score < 10 || right.score < 10 || left.score + right.score < 28) return null;

  const centerWidth = right.center - left.center;
  if (centerWidth < gridWidth * 0.28 || centerWidth > gridWidth * 0.9) return null;
  const center = (left.center + right.center) / 2;
  if (Math.abs(center - gridWidth / 2) > gridWidth * 0.24) return null;

  const support = new Float32Array(gridHeight);
  for (let y = 0; y < gridHeight; y += 1) {
    const leftX = Math.round(lineX(left, y, gridHeight));
    const rightX = Math.round(lineX(right, y, gridHeight));
    let leftStrength = 0;
    let rightStrength = 0;
    for (let delta = -2; delta <= 2; delta += 1) {
      const lx = leftX + delta;
      const rx = rightX + delta;
      if (lx >= 0 && lx < gridWidth) leftStrength = Math.max(leftStrength, positive[y * gridWidth + lx]);
      if (rx >= 0 && rx < gridWidth) rightStrength = Math.max(rightStrength, negative[y * gridWidth + rx]);
    }
    support[y] = Math.max(leftStrength / Math.max(10, left.score), rightStrength / Math.max(10, right.score));
  }

  const smoothed = new Float32Array(gridHeight);
  for (let y = 0; y < gridHeight; y += 1) {
    const start = Math.max(0, y - 4);
    const end = Math.min(gridHeight, y + 5);
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += support[index];
    smoothed[y] = sum / Math.max(1, end - start);
  }

  const segments: Array<{ start: number; end: number }> = [];
  for (let y = 0; y < gridHeight;) {
    if (smoothed[y] < 0.12) { y += 1; continue; }
    const start = y;
    while (y < gridHeight && smoothed[y] >= 0.12) y += 1;
    segments.push({ start, end: y - 1 });
  }
  const longest = segments.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  if (!longest || longest.end - longest.start < gridHeight * 0.38) return null;

  const extension = Math.round(gridHeight * 0.015);
  const topGrid = clamp(longest.start - extension, 0, gridHeight - 2);
  const bottomGrid = clamp(longest.end + extension, topGrid + 1, gridHeight - 1);
  const leftTop = lineX(left, topGrid, gridHeight);
  const leftBottom = lineX(left, bottomGrid, gridHeight);
  const rightTop = lineX(right, topGrid, gridHeight);
  const rightBottom = lineX(right, bottomGrid, gridHeight);
  const topWidth = rightTop - leftTop;
  const bottomWidth = rightBottom - leftBottom;
  if (Math.min(topWidth, bottomWidth) < gridWidth * 0.28) return null;
  if (Math.max(topWidth, bottomWidth) / Math.max(1, Math.min(topWidth, bottomWidth)) > 1.6) return null;

  const verticalExtent = bottomGrid - topGrid;
  const aspect = verticalExtent / Math.max(1, (topWidth + bottomWidth) / 2);
  if (aspect < 0.8 || aspect > 6) return null;

  // Un pequeño margen hacia el interior elimina la sombra del canto y evita
  // que una letra pegada al papel vecino entre en el recorte rectificado.
  const horizontalInset = Math.max(1, centerWidth * 0.008);

  return {
    top: topGrid * step,
    bottom: Math.min(height - 1, bottomGrid * step),
    topLeft: clamp((leftTop + horizontalInset) * step, 0, width - 2),
    topRight: clamp((rightTop - horizontalInset) * step, 1, width - 1),
    bottomLeft: clamp((leftBottom + horizontalInset) * step, 0, width - 2),
    bottomRight: clamp((rightBottom - horizontalInset) * step, 1, width - 1),
  };
}

export function detectPaper(data: ImageData, width: number, height: number): PaperGeometry | null {
  return detectPaperFromLongEdges(data, width, height) || detectPaperFromLightRuns(data, width, height);
}

function rectifyPaper(source: HTMLCanvasElement, geometry: PaperGeometry | null) {
  if (!geometry) {
    const copy = document.createElement("canvas"); copy.width = source.width; copy.height = source.height;
    copy.getContext("2d")?.drawImage(source, 0, 0);
    return { canvas: copy, corrected: false };
  }
  const sourceHeight = Math.max(1, geometry.bottom - geometry.top);
  const topWidth = geometry.topRight - geometry.topLeft;
  const bottomWidth = geometry.bottomRight - geometry.bottomLeft;
  const targetWidth = Math.max(1, Math.round((topWidth + bottomWidth) / 2));
  const marginX = Math.round(targetWidth * 0.04); const marginY = Math.round(sourceHeight * 0.025);
  const output = document.createElement("canvas"); output.width = targetWidth + marginX * 2; output.height = sourceHeight + marginY * 2;
  const context = output.getContext("2d"); if (!context) throw new Error("Canvas no disponible");
  context.fillStyle = "#fff"; context.fillRect(0, 0, output.width, output.height);
  const strip = Math.max(1, Math.round(sourceHeight / 1200));
  for (let destinationY = 0; destinationY < sourceHeight; destinationY += strip) {
    const ratio = destinationY / Math.max(1, sourceHeight - 1);
    const left = geometry.topLeft + (geometry.bottomLeft - geometry.topLeft) * ratio;
    const right = geometry.topRight + (geometry.bottomRight - geometry.topRight) * ratio;
    const y = geometry.top + destinationY;
    const h = Math.min(strip, sourceHeight - destinationY);
    context.drawImage(source, left, y, Math.max(1, right - left), h, marginX, marginY + destinationY, targetWidth, h);
  }
  const corrected = Math.abs(topWidth - bottomWidth) > Math.max(10, targetWidth * 0.02)
    || Math.abs(geometry.topLeft - geometry.bottomLeft) > Math.max(10, targetWidth * 0.02);
  return { canvas: output, corrected };
}

export function estimateDeskewFromSamples(samples: Array<{ x: number; y: number }>, width: number, height: number) {
  if (samples.length < 80) return 0;
  let bestAngle = 0; let bestScore = -Infinity;
  const step = Math.max(2, Math.round(height / 450));
  for (let angle = -8; angle <= 8; angle += 0.5) {
    const radians = (angle * Math.PI) / 180;
    const cosine = Math.cos(radians); const sine = Math.sin(radians);
    const bins = new Uint32Array(Math.ceil((height + Math.abs(width * sine)) / step) + 8);
    for (const point of samples) {
      const projected = point.y * cosine - point.x * sine + Math.abs(width * sine) + step * 2;
      const index = Math.floor(projected / step);
      if (index >= 0 && index < bins.length) bins[index] += 1;
    }
    let score = 0;
    for (let index = 1; index < bins.length - 1; index += 1) {
      const value = bins[index] * 2 + bins[index - 1] + bins[index + 1];
      score += value * value;
    }
    if (score > bestScore) { bestScore = score; bestAngle = angle; }
  }
  return Math.abs(bestAngle) < 0.4 ? 0 : Math.round(bestAngle * 2) / 2;
}

function deskew(source: HTMLCanvasElement) {
  const maxSide = 900; const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale)); const height = Math.max(1, Math.round(source.height * scale));
  const sample = document.createElement("canvas"); sample.width = width; sample.height = height;
  const context = sample.getContext("2d", { willReadFrequently: true }); if (!context) return { canvas: source, angle: 0 };
  context.drawImage(source, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height); const points: Array<{ x: number; y: number }> = [];
  const stride = Math.max(1, Math.round(Math.max(width, height) / 700));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      const luminance = data.data[offset] * 0.2126 + data.data[offset + 1] * 0.7152 + data.data[offset + 2] * 0.0722;
      if (luminance < 150) points.push({ x, y });
    }
  }
  if (points.length > 18000) {
    const every = Math.ceil(points.length / 18000);
    for (let index = points.length - 1; index >= 0; index -= 1) if (index % every !== 0) points.splice(index, 1);
  }
  const angle = estimateDeskewFromSamples(points, width, height);
  if (!angle) return { canvas: source, angle: 0 };
  const radians = (-angle * Math.PI) / 180; const cosine = Math.abs(Math.cos(radians)); const sine = Math.abs(Math.sin(radians));
  const output = document.createElement("canvas"); output.width = Math.ceil(source.width * cosine + source.height * sine); output.height = Math.ceil(source.height * cosine + source.width * sine);
  const outputContext = output.getContext("2d"); if (!outputContext) return { canvas: source, angle: 0 };
  outputContext.fillStyle = "#fff"; outputContext.fillRect(0, 0, output.width, output.height);
  outputContext.translate(output.width / 2, output.height / 2); outputContext.rotate(radians); outputContext.drawImage(source, -source.width / 2, -source.height / 2);
  return { canvas: output, angle };
}

export function localAdaptiveThreshold(grayscale: Uint8ClampedArray, width: number, height: number) {
  const output = new Uint8ClampedArray(grayscale.length); const stride = width + 1; const integral = new Uint32Array(stride * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let row = 0;
    for (let x = 1; x <= width; x += 1) {
      row += grayscale[((y - 1) * width + (x - 1)) * 4];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
    }
  }
  const radius = clamp(Math.round(Math.min(width, height) / 38), 18, 44); const ratio = 0.92;
  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - radius); const bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius); const right = Math.min(width, x + radius + 1); const area = (right - left) * (bottom - top);
      const sum = integral[bottom * stride + right] - integral[top * stride + right] - integral[bottom * stride + left] + integral[top * stride + left];
      const sourceOffset = (y * width + x) * 4;
      const value = grayscale[sourceOffset] < (sum / Math.max(1, area)) * ratio ? 0 : 255;
      output[sourceOffset] = output[sourceOffset + 1] = output[sourceOffset + 2] = value; output[sourceOffset + 3] = 255;
    }
  }
  return output;
}

function contrastStretch(data: ImageData) {
  const luminances: number[] = [];
  const every = Math.max(1, Math.floor((data.width * data.height) / 30000));
  for (let pixel = 0; pixel < data.width * data.height; pixel += every) {
    const offset = pixel * 4;
    luminances.push(Math.round(data.data[offset] * 0.2126 + data.data[offset + 1] * 0.7152 + data.data[offset + 2] * 0.0722));
  }
  luminances.sort((a, b) => a - b);
  const low = luminances[Math.floor(luminances.length * 0.03)] ?? 0;
  const high = luminances[Math.floor(luminances.length * 0.97)] ?? 255;
  const span = Math.max(40, high - low);
  const grayscale = new Uint8ClampedArray(data.data.length);
  for (let offset = 0; offset < data.data.length; offset += 4) {
    const raw = data.data[offset] * 0.2126 + data.data[offset + 1] * 0.7152 + data.data[offset + 2] * 0.0722;
    const value = clamp(Math.round(((raw - low) / span) * 255), 0, 255);
    grayscale[offset] = grayscale[offset + 1] = grayscale[offset + 2] = value; grayscale[offset + 3] = 255;
  }
  return grayscale;
}

export async function prepareReceiptImage(file: File): Promise<PreparedReceiptImage> {
  const started = performance.now();
  const bitmap = await createImageBitmap(file);
  try {
    let scale = bitmap.width < 1200 ? Math.min(1.35, 1500 / Math.max(1, bitmap.width)) : 1;
    if (bitmap.width * scale > 2100) scale = 2100 / bitmap.width;
    if (bitmap.height * scale > 3600) scale = Math.min(scale, 3600 / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale)); const height = Math.max(1, Math.round(bitmap.height * scale));
    const base = document.createElement("canvas"); base.width = width; base.height = height;
    const baseContext = base.getContext("2d", { willReadFrequently: true }); if (!baseContext) throw new Error("Canvas no disponible");
    baseContext.fillStyle = "#fff"; baseContext.fillRect(0, 0, width, height); baseContext.drawImage(bitmap, 0, 0, width, height);
    const geometry = detectPaper(baseContext.getImageData(0, 0, width, height), width, height);
    const rectified = rectifyPaper(base, geometry); const straight = deskew(rectified.canvas);
    const natural = straight.canvas; const context = natural.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("Canvas no disponible");
    const data = context.getImageData(0, 0, natural.width, natural.height); const grayscaleBytes = contrastStretch(data);
    const grayscale = document.createElement("canvas"); grayscale.width = natural.width; grayscale.height = natural.height;
    grayscale.getContext("2d")?.putImageData(new ImageData(grayscaleBytes, natural.width, natural.height), 0, 0);
    const adaptiveBytes = localAdaptiveThreshold(grayscaleBytes, natural.width, natural.height);
    const adaptive = document.createElement("canvas"); adaptive.width = natural.width; adaptive.height = natural.height;
    adaptive.getContext("2d")?.putImageData(new ImageData(adaptiveBytes, natural.width, natural.height), 0, 0);
    return {
      adaptive,
      grayscale,
      deskewAngle: straight.angle,
      perspectiveCorrected: rectified.corrected,
      paperDetected: Boolean(geometry),
      durationMs: Math.round((performance.now() - started) * 10) / 10,
    };
  } finally {
    bitmap.close();
  }
}
