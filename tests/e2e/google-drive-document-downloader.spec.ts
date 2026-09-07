import { generateKeyPairSync } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  FINANCIAL_APP_GOOGLE_PROJECT_ID,
  FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_DOCUMENT_READONLY_SCOPES,
  GOOGLE_SERVICE_ACCOUNT_TOKEN_URI,
  GoogleServiceAccountAccessTokenProvider,
  GoogleServiceAccountError,
  parseGoogleServiceAccountCredentials,
} from "../../src/infrastructure/google/google-service-account";
import {
  GoogleDriveDocumentDownloader,
  GoogleDriveDocumentError,
} from "../../src/infrastructure/google/google-drive-document-downloader";

const fileId = "1AbCdEfGhIjKlMnOpQrStUvWxYz_123456";

function generateCredentials() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return parseGoogleServiceAccountCredentials(JSON.stringify({
    type: "service_account",
    project_id: FINANCIAL_APP_GOOGLE_PROJECT_ID,
    private_key_id: "drive-test-key",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    client_email: FINANCIAL_APP_SERVICE_ACCOUNT_EMAIL,
    client_id: "116534793741269398387",
    token_uri: GOOGLE_SERVICE_ACCOUNT_TOKEN_URI,
  }));
}

test("F11 Drive OCR token requests only drive.readonly and rejects write scopes", async () => {
  const credentials = generateCredentials();
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body as URLSearchParams;
    const assertion = body.get("assertion") ?? "";
    const encodedClaims = assertion.split(".")[1];
    const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8"));
    expect(claims.scope).toBe(GOOGLE_DOCUMENT_READONLY_SCOPES.join(" "));
    return new Response(JSON.stringify({ access_token: "drive-read-token", expires_in: 3600, token_type: "Bearer" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const provider = new GoogleServiceAccountAccessTokenProvider(
    credentials,
    fetcher,
    () => Date.UTC(2026, 8, 7, 7, 10, 0),
    GOOGLE_DOCUMENT_READONLY_SCOPES,
  );
  await expect(provider.getAccessToken()).resolves.toBe("drive-read-token");

  expect(() => new GoogleServiceAccountAccessTokenProvider(
    credentials,
    fetch,
    Date.now,
    ["https://www.googleapis.com/auth/drive"],
  )).toThrow(GoogleServiceAccountError);
});

test("F11 Drive downloader validates metadata before reading bounded original bytes", async () => {
  const bytes = Buffer.from("%PDF-1.7\nOCR DRIVE TEST\n%%EOF", "utf8");
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer drive-read-token");
    expect(init?.redirect).toBe("error");
    if (url.includes("?fields=")) {
      return new Response(JSON.stringify({
        id: fileId,
        name: "factura-drive.pdf",
        mimeType: "application/pdf",
        size: String(bytes.byteLength),
        trashed: false,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("?alt=media")) {
      return new Response(bytes, {
        status: 200,
        headers: { "content-type": "application/pdf", "content-length": String(bytes.byteLength) },
      });
    }
    return new Response(null, { status: 500 });
  }) as typeof fetch;

  const downloader = new GoogleDriveDocumentDownloader(
    { getAccessToken: async () => "drive-read-token" },
    fetcher,
  );
  const result = await downloader.download({ fileId, expectedMimeType: "application/pdf" });
  expect(Buffer.from(result.bytes).equals(bytes)).toBe(true);
  expect(result).toMatchObject({
    fileId,
    fileName: "factura-drive.pdf",
    mimeType: "application/pdf",
    sizeBytes: bytes.byteLength,
  });
  expect(calls).toHaveLength(2);
  expect(calls[0]).toContain(`/drive/v3/files/${fileId}?fields=`);
  expect(calls[1]).toBe(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`);
});

test("F11 Drive downloader accepts chunked media when Google omits content-length", async () => {
  const bytes = Buffer.from("%PDF-1.7\nCHUNKED DRIVE TEST\n%%EOF", "utf8");
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("?fields=")) {
      return new Response(JSON.stringify({
        id: fileId,
        name: "ticket-chunked.pdf",
        mimeType: "application/pdf",
        size: String(bytes.byteLength),
        trashed: false,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("?alt=media")) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
    }
    return new Response(null, { status: 500 });
  }) as typeof fetch;

  const downloader = new GoogleDriveDocumentDownloader(
    { getAccessToken: async () => "drive-read-token" },
    fetcher,
  );

  const result = await downloader.download({ fileId, expectedMimeType: "application/pdf" });
  expect(Buffer.from(result.bytes).equals(bytes)).toBe(true);
  expect(result.sizeBytes).toBe(bytes.byteLength);
});

test("F11 Drive downloader fails closed when Financial App Reader lacks access", async () => {
  const downloader = new GoogleDriveDocumentDownloader(
    { getAccessToken: async () => "drive-read-token" },
    (async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })) as typeof fetch,
  );
  await expect(downloader.download({ fileId, expectedMimeType: "application/pdf" })).rejects.toMatchObject({
    name: "GoogleDriveDocumentError",
    code: "google_drive_document_access_denied",
  } satisfies Partial<GoogleDriveDocumentError>);
});

test("F11 Drive downloader rejects MIME drift before downloading file content", async () => {
  let calls = 0;
  const downloader = new GoogleDriveDocumentDownloader(
    { getAccessToken: async () => "drive-read-token" },
    (async () => {
      calls += 1;
      return new Response(JSON.stringify({
        id: fileId,
        name: "cambio.png",
        mimeType: "image/png",
        size: "1200",
        trashed: false,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  );
  await expect(downloader.download({ fileId, expectedMimeType: "application/pdf" })).rejects.toMatchObject({
    code: "google_drive_document_mime_mismatch",
  });
  expect(calls).toBe(1);
});
