import assert from "node:assert/strict";
import { readServerImageMetadata } from "../lib/document/server-image-metadata";

function makePng(width: number, height: number) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function makeJpeg(width: number, height: number) {
  const bytes = Buffer.alloc(21);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xc0;
  bytes.writeUInt16BE(17, 4);
  bytes[6] = 8;
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  return bytes;
}

function writeUInt24LE(bytes: Buffer, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function makeWebp(width: number, height: number) {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  writeUInt24LE(bytes, 24, width - 1);
  writeUInt24LE(bytes, 27, height - 1);
  return bytes;
}

assert.deepEqual(readServerImageMetadata(makePng(1080, 1920)), {
  format: "png",
  mime: "image/png",
  width: 1080,
  height: 1920,
});
assert.deepEqual(readServerImageMetadata(makeJpeg(3024, 4032)), {
  format: "jpeg",
  mime: "image/jpeg",
  width: 3024,
  height: 4032,
});
assert.deepEqual(readServerImageMetadata(makeWebp(1600, 900)), {
  format: "webp",
  mime: "image/webp",
  width: 1600,
  height: 900,
});
assert.equal(readServerImageMetadata(Buffer.from("not-an-image")), null);
assert.equal(readServerImageMetadata(Buffer.alloc(0)), null);

console.log("Server image metadata tests OK · JPEG/PNG/WebP dimensions come from uploaded bytes");
