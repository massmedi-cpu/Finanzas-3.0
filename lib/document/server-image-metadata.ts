export type SupportedServerImage = {
  format: "jpeg" | "png" | "webp";
  mime: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
};

function validDimensions(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0;
}

function pngMetadata(bytes: Buffer): SupportedServerImage | null {
  if (bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return validDimensions(width, height) ? { format: "png", mime: "image/png", width, height } : null;
}

function jpegMetadata(bytes: Buffer): SupportedServerImage | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;

  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      return validDimensions(width, height) ? { format: "jpeg", mime: "image/jpeg", width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function readUInt24LE(bytes: Buffer, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function webpMetadata(bytes: Buffer): SupportedServerImage | null {
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = bytes.toString("ascii", 12, 16);
  let width = 0;
  let height = 0;

  if (chunk === "VP8X") {
    width = readUInt24LE(bytes, 24) + 1;
    height = readUInt24LE(bytes, 27) + 1;
  } else if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    width = bytes.readUInt16LE(26) & 0x3fff;
    height = bytes.readUInt16LE(28) & 0x3fff;
  } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  }

  return validDimensions(width, height) ? { format: "webp", mime: "image/webp", width, height } : null;
}

export function readServerImageMetadata(bytes: Buffer): SupportedServerImage | null {
  return pngMetadata(bytes) || jpegMetadata(bytes) || webpMetadata(bytes);
}
