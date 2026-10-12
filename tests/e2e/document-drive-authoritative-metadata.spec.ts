import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GOOGLE_DRIVE_OCR_MAX_BYTES,
  GoogleDriveDocumentDownloader,
} from "../../src/infrastructure/google/google-drive-document-downloader";

// Purely synthetic Google Drive metadata and PDF signature. No user file,
// credentials, bank writes or live Google service is accessed here.
const fileId = "syntheticDriveFile123";
const pdf = "%PDF-1.4\n1 0 obj\nendobj\n%%EOF\n";
const authoritativeDate = "2026-10-12T08:00:00.000Z";

function fakeDownloader(modifiedTime: unknown) {
  let metadataCalls = 0;
  let mediaCalls = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("?fields=")) {
      metadataCalls += 1;
      expect(url).toContain("modifiedTime");
      return Response.json({
        id: fileId,
        name: "factura-servidor.pdf",
        mimeType: "application/pdf",
        size: String(Buffer.byteLength(pdf)),
        trashed: false,
        ...(modifiedTime === undefined ? {} : { modifiedTime }),
      });
    }
    mediaCalls += 1;
    expect(url).toContain("?alt=media");
    return new Response(pdf, {
      status: 200, headers: { "content-length": String(Buffer.byteLength(pdf)) },
    });
  };
  const downloader = new GoogleDriveDocumentDownloader(
    { getAccessToken: async () => "synthetic-readonly-token" },
    fetcher,
  );
  return { downloader, counts: () => ({ metadataCalls, mediaCalls }) };
}

test("REC-DRIVE-120 · downloaded Drive metadata decides persisted source date", async () => {
  const { downloader, counts } = fakeDownloader(authoritativeDate);
  const file = await downloader.download({ fileId, expectedMimeType: "application/pdf" });
  expect(file).toMatchObject({
    fileId, fileName: "factura-servidor.pdf",
    mimeType: "application/pdf", sizeBytes: Buffer.byteLength(pdf),
    modifiedTime: authoritativeDate,
  });
  expect(counts()).toEqual({ metadataCalls: 1, mediaCalls: 1 });
});

for (const date of ["yesterday", "2026-10-12", "2026-10-12T08:00:00", 1234, ""]) {
  test("REC-DRIVE-121 · malformed Drive modification time fails closed: " + String(date), async () => {
    const { downloader, counts } = fakeDownloader(date);
    await expect(downloader.download({ fileId, expectedMimeType: "application/pdf" }))
      .rejects.toMatchObject({ code: "google_drive_document_metadata_invalid" });
    expect(counts()).toEqual({ metadataCalls: 1, mediaCalls: 0 });
  });
}

test("REC-DRIVE-122 · missing Drive timestamp stays unknown, never browser-provided", async () => {
  const { downloader } = fakeDownloader(undefined);
  const result = await downloader.download({ fileId, expectedMimeType: "application/pdf" });
  expect(result.modifiedTime).toBeNull();
});

test("REC-DRIVE-123 · both document gateways forward authoritative preflight timestamp", () => {
  const manual = readFileSync(join(process.cwd(), "app/api/documents/route.ts"), "utf8");
  const automatic = readFileSync(join(process.cwd(), "app/api/documents/drive-sync/route.ts"), "utf8");
  const manualBlock = manual.slice(
    manual.indexOf('if (action === "drive_batch")'),
    manual.indexOf('throw new Error("invalid_document_action");', manual.indexOf('if (action === "drive_batch")')),
  );
  expect(manualBlock).toContain("modifiedTime: downloaded.modifiedTime");
  expect(manualBlock).not.toContain("item.modifiedTime");
  expect(automatic).toContain("modifiedTime: downloaded.modifiedTime ?? candidate.modifiedTime");
  expect(automatic).toContain('callPersistenceGateway("document.drive_batch"');
});

test("REC-DRIVE-124 · oversized body without Content-Length is cancelled before buffering", async () => {
  let cancelled = false;
  const fetcher: typeof fetch = async input => {
    if (String(input).includes("?fields=")) {
      return Response.json({
        id: fileId, name: "factura-simulada.pdf",
        mimeType: "application/pdf", size: String(Buffer.byteLength(pdf)),
        modifiedTime: authoritativeDate, trashed: false,
      });
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(GOOGLE_DRIVE_OCR_MAX_BYTES + 1));
      },
      cancel() { cancelled = true; },
    });
    return new Response(body, { status: 200 });
  };
  const downloader = new GoogleDriveDocumentDownloader(
    { getAccessToken: async () => "synthetic-readonly-token" }, fetcher,
  );
  await expect(downloader.download({ fileId, expectedMimeType: "application/pdf" }))
    .rejects.toMatchObject({ code: "google_drive_document_too_large" });
  expect(cancelled).toBe(true);
});

test("REC-DRIVE-125 · valid PDF split across stream chunks imports with no Content-Length", async () => {
  const source = Buffer.from(pdf);
  const fetcher: typeof fetch = async input => {
    if (String(input).includes("?fields=")) {
      return Response.json({
        id: fileId, name: "factura-fragmentada.pdf",
        mimeType: "application/pdf", size: String(source.byteLength),
        modifiedTime: authoritativeDate, trashed: false,
      });
    }
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(source.subarray(0, 2));
        controller.enqueue(source.subarray(2, 9));
        controller.enqueue(source.subarray(9));
        controller.close();
      },
    }), { status: 200 });
  };
  const downloader = new GoogleDriveDocumentDownloader(
    { getAccessToken: async () => "synthetic-readonly-token" }, fetcher,
  );
  const doc = await downloader.download({ fileId, expectedMimeType: "application/pdf" });
  expect(Buffer.from(doc.bytes).equals(source)).toBe(true);
  expect(doc.modifiedTime).toBe(authoritativeDate);
});
