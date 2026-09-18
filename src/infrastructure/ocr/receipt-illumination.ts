import sharp from "sharp";

/** Binarize against nearby paper, so folds and broad shadows do not become ink. */
export async function normalizeReceiptIllumination(
  bytes: Uint8Array,
  glyphHeight: number,
  variant: 0 | 1,
) {
  const { data, info } = await sharp(Buffer.from(bytes), { failOn: "error" })
    .removeAlpha().grayscale().raw().toBuffer({ resolveWithObject: true });
  const height = Number.isFinite(glyphHeight) ? Math.max(6, Math.min(120, glyphHeight)) : 30;
  const window = Math.max(3, Math.min(49, Math.round(height * 0.4) | 1));
  const backgroundImage = sharp(data, { raw: info });
  const background = await (variant === 0
    ? backgroundImage.blur(Math.max(2, height / 3))
    : backgroundImage.median(window))
    .grayscale().raw().toBuffer();
  if (background.length !== data.length) throw new Error("ocr_illumination_channels");
  const pixels = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 1) {
    pixels[index] = data[index] < background[index] * 0.78 ? 0 : 255;
  }
  return sharp(pixels, { raw: info }).png({ compressionLevel: 3 }).toBuffer();
}
