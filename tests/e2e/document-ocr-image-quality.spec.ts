import { expect, test } from "@playwright/test";
import { assessReceiptImageQuality } from "../../src/infrastructure/ocr/receipt-illumination";

function grayscale(width: number, height: number, pixel: (x: number, y: number) => number) {
  const bytes = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      bytes[y * width + x] = Math.max(0, Math.min(255, Math.round(pixel(x, y))));
    }
  }
  return bytes;
}

test("PRE-038 §111 perspective assessment distinguishes a stable rectangle from converging dark extents", () => {
  const width = 160;
  const height = 220;
  const rectangular = grayscale(width, height, (x, y) => {
    if (y < 12 || y > height - 12) return 245;
    return x >= 28 && x <= 132 ? 35 : 245;
  });
  const trapezoid = grayscale(width, height, (x, y) => {
    if (y < 12 || y > height - 12) return 245;
    const share = y / (height - 1);
    const left = 18 + share * 24;
    const right = 142 - share * 24;
    return x >= left && x <= right ? 35 : 245;
  });

  const stable = assessReceiptImageQuality(rectangular, width, height);
  const perspective = assessReceiptImageQuality(trapezoid, width, height);

  expect(stable.needsPerspectiveCorrection).toBe(false);
  expect(perspective.needsPerspectiveCorrection).toBe(true);
  expect(perspective.perspectiveScore).toBeGreaterThan(stable.perspectiveScore + 0.08);
  expect(perspective.perspectiveConfidence).toBeGreaterThanOrEqual(0.45);
});

test("PRE-038 §111 flags broad illumination imbalance without mutating source pixels", () => {
  const width = 120;
  const height = 240;
  const source = grayscale(width, height, (_x, y) => 245 - (y / (height - 1)) * 95);
  const before = source.slice();
  const quality = assessReceiptImageQuality(source, width, height);

  expect(quality.needsIllumination).toBe(true);
  expect(quality.illuminationRange).toBeGreaterThan(34);
  expect(source).toEqual(before);
});

test("PRE-038 §111 rejects inconsistent image dimensions", () => {
  expect(() => assessReceiptImageQuality(new Uint8Array(10), 20, 20)).toThrow("ocr_image_quality_dimensions");
});
