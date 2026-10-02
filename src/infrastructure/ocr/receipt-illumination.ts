import sharp from "sharp";

export type ReceiptImageQualityAssessment = {
  contrast: number;
  illuminationRange: number;
  edgeEnergy: number;
  noiseEnergy: number;
  perspectiveScore: number;
  perspectiveConfidence: number;
  needsContrast: boolean;
  needsIllumination: boolean;
  needsNoiseReduction: boolean;
  needsSharpnessRecovery: boolean;
  needsPerspectiveCorrection: boolean;
};

type LinearFit = { slope: number; r2: number };

function quantile(values: number[], share: number) {
  if (!values.length) return 0;
  const index = Math.max(0, Math.min(values.length - 1, Math.round((values.length - 1) * share)));
  return values[index];
}

function linearFit(points: Array<{ x: number; y: number }>): LinearFit {
  if (points.length < 3) return { slope: 0, r2: 0 };
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX <= 1e-9 || varianceY <= 1e-9) return { slope: 0, r2: varianceY <= 1e-9 ? 1 : 0 };
  const slope = covariance / varianceX;
  const r = covariance / Math.sqrt(varianceX * varianceY);
  return { slope, r2: Math.max(0, Math.min(1, r * r)) };
}

function perspectiveFromDarkExtents(
  pixels: Uint8Array,
  width: number,
  height: number,
  darkThreshold: number,
  step: number,
) {
  const bands = 10;
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  for (let band = 0; band < bands; band += 1) {
    const startY = Math.floor((band / bands) * height);
    const endY = Math.max(startY + 1, Math.floor(((band + 1) / bands) * height));
    const xs: number[] = [];
    for (let y = startY; y < endY; y += step) {
      const row = y * width;
      for (let x = 0; x < width; x += step) {
        if (pixels[row + x] <= darkThreshold) xs.push(x / Math.max(1, width - 1));
      }
    }
    if (xs.length < Math.max(12, Math.floor(width / Math.max(1, step * 12)))) continue;
    xs.sort((a, b) => a - b);
    const y = (startY + endY) / 2 / Math.max(1, height - 1);
    left.push({ x: y, y: quantile(xs, 0.08) });
    right.push({ x: y, y: quantile(xs, 0.92) });
  }

  const leftFit = linearFit(left);
  const rightFit = linearFit(right);
  const divergence = Math.abs(leftFit.slope - rightFit.slope);
  const confidence = Math.min(leftFit.r2, rightFit.r2) * Math.min(1, left.length / 7);
  return {
    score: divergence,
    confidence,
    needsCorrection: divergence >= 0.08 && confidence >= 0.45,
  };
}

/**
 * Evaluate the source pixels before OCR recovery. The assessment is deliberately diagnostic:
 * perspective is never warped blindly because the stored original and OCR geometry must remain
 * trustworthy. A later recovery stage may use an alternative preprocessing candidate, but only
 * consensus is allowed to replace evidence from the base OCR pass.
 */
export function assessReceiptImageQuality(
  pixels: Uint8Array,
  width: number,
  height: number,
): ReceiptImageQualityAssessment {
  if (width <= 0 || height <= 0 || pixels.length < width * height) {
    throw new Error("ocr_image_quality_dimensions");
  }

  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 120_000)));
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  let noiseSum = 0;
  let noiseCount = 0;
  const bandSums = new Array(12).fill(0) as number[];
  const bandCounts = new Array(12).fill(0) as number[];

  for (let y = 0; y < height; y += step) {
    const row = y * width;
    const band = Math.min(11, Math.floor((y / Math.max(1, height)) * 12));
    for (let x = 0; x < width; x += step) {
      const value = pixels[row + x];
      count += 1;
      sum += value;
      sumSquares += value * value;
      bandSums[band] += value;
      bandCounts[band] += 1;

      if (x + step < width) {
        edgeSum += Math.abs(value - pixels[row + x + step]);
        edgeCount += 1;
      }
      if (y + step < height) {
        edgeSum += Math.abs(value - pixels[(y + step) * width + x]);
        edgeCount += 1;
      }
      if (x + step * 2 < width) {
        const middle = pixels[row + x + step];
        const end = pixels[row + x + step * 2];
        noiseSum += Math.abs(value - 2 * middle + end);
        noiseCount += 1;
      }
    }
  }

  const mean = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSquares / count - mean * mean) : 0;
  const contrast = Math.sqrt(variance);
  const bandMeans = bandSums.flatMap((value, index) => bandCounts[index] ? [value / bandCounts[index]] : []);
  const illuminationRange = bandMeans.length ? Math.max(...bandMeans) - Math.min(...bandMeans) : 0;
  const edgeEnergy = edgeCount ? edgeSum / edgeCount : 0;
  const noiseEnergy = noiseCount ? noiseSum / noiseCount : 0;
  const darkThreshold = Math.max(20, Math.min(220, mean - Math.max(14, contrast * 0.42)));
  const perspective = perspectiveFromDarkExtents(pixels, width, height, darkThreshold, step);

  return {
    contrast: Number(contrast.toFixed(2)),
    illuminationRange: Number(illuminationRange.toFixed(2)),
    edgeEnergy: Number(edgeEnergy.toFixed(2)),
    noiseEnergy: Number(noiseEnergy.toFixed(2)),
    perspectiveScore: Number(perspective.score.toFixed(3)),
    perspectiveConfidence: Number(perspective.confidence.toFixed(3)),
    needsContrast: contrast < 28,
    needsIllumination: illuminationRange > 34,
    needsNoiseReduction: noiseEnergy > Math.max(26, edgeEnergy * 2.4),
    needsSharpnessRecovery: contrast >= 18 && edgeEnergy < 8,
    needsPerspectiveCorrection: perspective.needsCorrection,
  };
}

/** Binarize against nearby paper, so folds and broad shadows do not become ink. */
export async function normalizeReceiptIllumination(
  bytes: Uint8Array,
  glyphHeight: number,
  variant: 0 | 1,
) {
  const { data, info } = await sharp(Buffer.from(bytes), { failOn: "error" })
    .removeAlpha().grayscale().raw().toBuffer({ resolveWithObject: true });
  const quality = assessReceiptImageQuality(data, info.width, info.height);
  if (process.env.VERCEL_ENV === "preview") {
    console.info("ocr-image-quality-v1", quality);
  }

  const height = Number.isFinite(glyphHeight) ? Math.max(6, Math.min(120, glyphHeight)) : 30;
  const window = Math.max(3, Math.min(49, Math.round(height * 0.4) | 1));
  const backgroundImage = sharp(data, { raw: info });
  const background = await (variant === 0
    ? backgroundImage.blur(Math.max(2, height / 3))
    : backgroundImage.median(window))
    .grayscale().raw().toBuffer();
  if (background.length !== data.length) throw new Error("ocr_illumination_channels");
  // The background buffer is independent after await, so the decoded grayscale buffer can be
  // binarized in place instead of allocating a third full-image raw buffer.
  for (let index = 0; index < data.length; index += 1) {
    data[index] = data[index] < background[index] * 0.78 ? 0 : 255;
  }
  return sharp(data, { raw: info }).png({ compressionLevel: 3 }).toBuffer();
}
