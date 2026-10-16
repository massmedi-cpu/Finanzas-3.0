import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { publicGatewayErrorCode } from "../../src/infrastructure/http/gateway-public-error";
import {
  MAX_COMPRESSED_GATEWAY_BODY_BYTES,
  MAX_DECOMPRESSED_GATEWAY_BODY_BYTES,
  readGatewayJsonBody,
} from "../../src/infrastructure/http/gateway-request-body";

const url = "https://financial-app.test/functions/v1/financial-app-db-gateway";

function post(body: Uint8Array | string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers, body });
}

test("REC-GATEWAY-MEM-001 · ordinary and gzipped operations retain their JSON contract", async () => {
  const operation = { action: "forecast.snapshot", payload: { dateFrom: "2026-10-14" } };
  const serialized = JSON.stringify(operation);
  await expect(readGatewayJsonBody(post(serialized)))
    .resolves.toEqual(operation);
  await expect(readGatewayJsonBody(post(serialized, { "content-encoding": "identity" })))
    .resolves.toEqual(operation);
  await expect(readGatewayJsonBody(post(Uint8Array.from(gzipSync(serialized)), { "content-encoding": "gzip" })))
    .resolves.toEqual(operation);
  await expect(readGatewayJsonBody(new Request(url, { method: "POST" }))).resolves.toEqual({});
});

test("REC-GATEWAY-MEM-002 · false or absent Content-Length cannot bypass streamed byte caps", async () => {
  let cancelled = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_COMPRESSED_GATEWAY_BODY_BYTES));
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() { cancelled += 1; },
  });
  const req = new Request(url, {
    method: "POST",
    headers: { "content-encoding": "gzip", "content-length": "2" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  await expect(readGatewayJsonBody(req)).rejects.toThrow("gateway_compressed_body_too_large");
  expect(cancelled).toBe(1);
  await expect(readGatewayJsonBody(post(new Uint8Array([1, 2, 3]), {
    "content-encoding": "gzip",
    "content-length": String(MAX_COMPRESSED_GATEWAY_BODY_BYTES + 1),
  }))).rejects.toThrow("gateway_compressed_body_too_large");
});

test("REC-GATEWAY-MEM-003 · gzip inflation bombs never allocate beyond the 16 MB output limit", async () => {
  const bomb = Uint8Array.from(gzipSync(Buffer.alloc(MAX_DECOMPRESSED_GATEWAY_BODY_BYTES + 1, 0)));
  expect(bomb.byteLength).toBeLessThan(MAX_COMPRESSED_GATEWAY_BODY_BYTES);
  await expect(readGatewayJsonBody(post(bomb, { "content-encoding": "gzip" })))
    .rejects.toThrow("gateway_body_too_large");
});

test("REC-GATEWAY-MEM-004 · corrupted streams, compression and encodings fail closed", async () => {
  await expect(readGatewayJsonBody(post(new Uint8Array([0, 1, 2, 3]), {
    "content-encoding": "gzip",
  }))).rejects.toThrow("invalid_gateway_gzip");
  await expect(readGatewayJsonBody(post("{}", { "content-encoding": "deflate" })))
    .rejects.toThrow("unsupported_content_encoding");
  const broken = new ReadableStream<Uint8Array>({
    pull(controller) { controller.error(new Error("synthetic truncated stream")); },
  });
  const req = new Request(url, { method: "POST", body: broken, duplex: "half" } as RequestInit);
  await expect(readGatewayJsonBody(req)).rejects.toThrow("gateway_body_read_failed");
});

test("REC-GATEWAY-MEM-005 · deployed Edge entrypoint calls the bounded request reader", () => {
  const edge = readFileSync(join(process.cwd(),
    "supabase/functions/financial-app-db-gateway/index.ts"), "utf8");
  expect(edge).toContain('import { readGatewayJsonBody } from "../../../src/infrastructure/http/gateway-request-body.ts"');
  expect(edge).toContain("body = await readGatewayJsonBody(req)");
  expect(edge).not.toContain("await req.arrayBuffer()");
  expect(edge).not.toContain("gunzipSync(");
});

test("REC-SEC-GW-002 · SQL details and private values never become public gateway errors", () => {
  for (const code of [
    "invalid_account_id", "document_storage_unavailable",
    "workspace_owner_required", "google_oauth_store_failed",
    "duplicate_ordered_ids", "unsupported_action",
  ]) {
    expect(publicGatewayErrorCode(new Error(code))).toBe(code);
  }
  for (const unsafe of [
    "duplicate key value violates unique constraint \"accounts_pkey\" (IBAN ES7620...)",
    "PostgresError: connection to db.btzukbfesxdratqnxuoj.supabase.co failed",
    "Bearer confidential_token_123",
    "invalid_account_1234567890123456789012",
    "invalid_account_id; SELECT * FROM financial_app.transactions",
    "invalid_account_id\\nBanco: Saldo privado 2.000 €",
    "google_oauth_store_failed: refresh_token=secret-value",
    "invalid_account_" + "a".repeat(90),
  ]) {
    expect(publicGatewayErrorCode(new Error(unsafe)), unsafe).toBe("gateway_error");
  }
  expect(publicGatewayErrorCode({ message: "invalid_account_id" })).toBe("gateway_error");
  expect(publicGatewayErrorCode(null)).toBe("gateway_error");

  const edge = readFileSync(join(process.cwd(),
    "supabase/functions/financial-app-db-gateway/index.ts"), "utf8");
  expect(edge).toContain("const code = publicGatewayErrorCode(error)");
  expect(edge).toContain("return json({ error: code }, 400)");
  expect(edge).not.toContain('error instanceof Error ? error.message : String(error)');
  expect(edge).not.toContain('return json({ error: error instanceof Error ? error.message');
});
