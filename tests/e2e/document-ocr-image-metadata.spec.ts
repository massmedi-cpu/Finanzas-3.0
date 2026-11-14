import { expect, test } from "@playwright/test";
import { readOcrImageMetadata } from "../../src/infrastructure/ocr/image-metadata";

// REC-OCR-META-001: synthetically constructed image headers only; no owner
// photographs, invoices, OCR workers or financial data in these tests.
function pngHeader(width = 640, height = 480) {
  const bytes = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

function webpHeader(chunk: "VP8X" | "VP8 " | "VP8L") {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(22, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write(chunk, 12, "ascii");
  bytes.writeUInt32LE(10, 16);
  if (chunk === "VP8X") {
    bytes[24] = 127;
    bytes[27] = 63;
  } else if (chunk === "VP8 ") {
    bytes[23] = 0x9d;
    bytes[24] = 0x01;
    bytes[25] = 0x2a;
    bytes.writeUInt16LE(128, 26);
    bytes.writeUInt16LE(64, 28);
  } else {
    bytes[20] = 0x2f;
    bytes.writeUInt32LE(127 | (63 << 14), 21);
  }
  return bytes;
}

test("REC-OCR-META-001 PNG dimensions require complete IHDR header", () => {
  const valid = pngHeader();
  expect(readOcrImageMetadata(valid)).toEqual({ mimeType: "image/png", width: 640, height: 480 });
  // A PNG signature with random length/type bytes must not authorize OCR.
  const noIhdr = Buffer.from(valid);
  noIhdr.write("FAKE", 12, "ascii");
  expect(readOcrImageMetadata(noIhdr)).toBeNull();
  const noIhdrLength = Buffer.from(valid);
  noIhdrLength.writeUInt32BE(14, 8);
  expect(readOcrImageMetadata(noIhdrLength)).toBeNull();
  expect(readOcrImageMetadata(valid.subarray(0, 24))).toBeNull();
  expect(readOcrImageMetadata(pngHeader(0, 480))).toBeNull();
});

test("REC-OCR-META-002 PNG subarray with nonzero byteOffset reads correct geometry", () => {
  const padded = Buffer.concat([Buffer.alloc(7), pngHeader(1080, 1920), Buffer.alloc(9)]);
  expect(readOcrImageMetadata(padded.subarray(7, 40)))
    .toEqual({ mimeType: "image/png", width: 1080, height: 1920 });
});

test("REC-OCR-META-003 WebP VP8X, VP8 and VP8L preserve dimensions", () => {
  for (const chunk of ["VP8X", "VP8 ", "VP8L"] as const) {
    expect(readOcrImageMetadata(webpHeader(chunk)), chunk)
      .toEqual({ mimeType: "image/webp", width: 128, height: 64 });
  }
});

test("REC-OCR-META-004 truncated and contradictory WebP sizes are rejected", () => {
  const valid = webpHeader("VP8X");
  const beyondRiff = Buffer.from(valid);
  beyondRiff.writeUInt32LE(200, 4);
  expect(readOcrImageMetadata(beyondRiff)).toBeNull();
  const beyondChunk = Buffer.from(valid);
  beyondChunk.writeUInt32LE(200, 16);
  expect(readOcrImageMetadata(beyondChunk)).toBeNull();
  const wrongRiff = Buffer.from(valid);
  wrongRiff.writeUInt32LE(20, 4);
  expect(readOcrImageMetadata(wrongRiff)).toBeNull();
  const wrongExtendedSize = Buffer.from(valid);
  wrongExtendedSize.writeUInt32LE(9, 16);
  expect(readOcrImageMetadata(wrongExtendedSize)).toBeNull();
  expect(readOcrImageMetadata(valid.subarray(0, 23))).toBeNull();
});

test("REC-OCR-META-005 unrelated bytes have no OCR metadata", () => {
  expect(readOcrImageMetadata(Buffer.alloc(34))).toBeNull();
  expect(readOcrImageMetadata(Buffer.from("%PDF-1.7"))).toBeNull();
});

test("REC-OCR-META-006 JPEG accepts SOF before SOS and rejects forged SOF in scan data", () => {
  // The minimal SOF0 marker defines an 128x64 image. APP0 is a safe
  // stand-in for camera EXIF / JPEG application metadata before SOF.
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x40, 0x00, 0x80, 0x01, 0x01, 0x11, 0x00]);
  const valid = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]),
    sof, Buffer.from([0xff, 0xd9]),
  ]);
  expect(readOcrImageMetadata(valid))
    .toEqual({ mimeType: "image/jpeg", width: 128, height: 64 });

  // A shortened or corrupted JPEG cannot supply its dimensions by hiding
  // a start-of-frame-looking byte sequence in entropy-coded scan data.
  const scanOnly = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0, 0, 0, 0, 0, 0]),
    sof, Buffer.from([0xff, 0xd9]),
  ]);
  expect(readOcrImageMetadata(scanOnly)).toBeNull();

  // The decoder's end-of-image marker also terminates metadata scanning.
  const trailing = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xd9]), sof]);
  expect(readOcrImageMetadata(trailing)).toBeNull();
  expect(readOcrImageMetadata(valid.subarray(0, 12))).toBeNull();
});

test("REC-OCR-META-007 reject SOF after unframed JPEG data and nested SOI", () => {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x40, 0x00, 0x80, 0x01, 0x01, 0x11, 0x00]);
  // Prior to this regression, the scanner skipped arbitrary junk to the
  // next FF C0 and incorrectly reported geometry for an invalid upload.
  const junk = Buffer.concat([Buffer.from([0xff, 0xd8, 0x13, 0x37, 0x42]), sof]);
  expect(readOcrImageMetadata(junk)).toBeNull();
  const nestedStart = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xd8]), sof]);
  expect(readOcrImageMetadata(nestedStart)).toBeNull();
  const byteStuffed = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0x00]), sof]);
  expect(readOcrImageMetadata(byteStuffed)).toBeNull();
});

test("REC-OCR-META-008 reject impossible JPEG SOF segment lengths and components", () => {
  // Length seven has room for dimensions but not the mandatory component
  // count and component description; it was previously accepted.
  const short = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x00, 0x40, 0x00, 0x80]);
  expect(readOcrImageMetadata(short)).toBeNull();

  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x40, 0x00, 0x80, 0x01, 0x01, 0x11, 0x00]);
  const zeroComponents = Buffer.from(sof);
  zeroComponents[9] = 0;
  expect(readOcrImageMetadata(Buffer.concat([Buffer.from([0xff, 0xd8]), zeroComponents]))).toBeNull();
  const fiveComponents = Buffer.from(sof);
  fiveComponents[9] = 5;
  expect(readOcrImageMetadata(Buffer.concat([Buffer.from([0xff, 0xd8]), fiveComponents]))).toBeNull();
  const wrongLength = Buffer.concat([Buffer.from(sof), Buffer.from([0x00])]);
  wrongLength.writeUInt16BE(12, 2);
  expect(readOcrImageMetadata(Buffer.concat([Buffer.from([0xff, 0xd8]), wrongLength]))).toBeNull();
});

test("REC-OCR-META-009 valid three-component JPEG with FF fill and sliced buffer", () => {
  const sof = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x80, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]);
  const bytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), sof, Buffer.from([0xff, 0xd9])]);
  expect(readOcrImageMetadata(bytes)).toEqual({ mimeType: "image/jpeg", width: 128, height: 64 });
  const padded = Buffer.concat([Buffer.alloc(5), bytes, Buffer.alloc(7)]);
  expect(readOcrImageMetadata(padded.subarray(5, padded.length - 7)))
    .toEqual({ mimeType: "image/jpeg", width: 128, height: 64 });
});
