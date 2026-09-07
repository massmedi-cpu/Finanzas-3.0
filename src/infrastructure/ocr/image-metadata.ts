export type OcrImageMetadata = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
};

function valid(width: number, height: number) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0;
}

function png(bytes: Uint8Array): OcrImageMetadata | null {
  if (bytes.byteLength < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return valid(width, height) ? { mimeType: "image/png", width, height } : null;
}

function jpeg(bytes: Uint8Array): OcrImageMetadata | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < bytes.byteLength) {
    while (offset < bytes.byteLength && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.byteLength) break;
    const length = view.getUint16(offset, false);
    if (length < 2 || offset + length > bytes.byteLength) break;
    if (startOfFrame.has(marker) && length >= 7) {
      const height = view.getUint16(offset + 3, false);
      const width = view.getUint16(offset + 5, false);
      return valid(width, height) ? { mimeType: "image/jpeg", width, height } : null;
    }
    offset += length;
  }
  return null;
}

function uint24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function webp(bytes: Uint8Array): OcrImageMetadata | null {
  if (bytes.byteLength < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = ascii(bytes, 12, 16);
  let width = 0;
  let height = 0;
  if (chunk === "VP8X") {
    width = uint24le(bytes, 24) + 1;
    height = uint24le(bytes, 27) + 1;
  } else if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    width = view.getUint16(26, true) & 0x3fff;
    height = view.getUint16(28, true) & 0x3fff;
  } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = view.getUint32(21, true);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  }
  return valid(width, height) ? { mimeType: "image/webp", width, height } : null;
}

export function readOcrImageMetadata(bytes: Uint8Array) {
  return png(bytes) ?? jpeg(bytes) ?? webp(bytes);
}
