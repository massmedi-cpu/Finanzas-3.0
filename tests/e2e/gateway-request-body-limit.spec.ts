import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { knownPublicErrorCode, publicGatewayErrorCode, publicRemoteGatewayCode } from "../../src/infrastructure/http/gateway-public-error";
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
  expect(edge).toContain('console.error("financial-app-db-gateway-auth", publicGatewayErrorCode(error))');
  expect(edge).toContain('console.error("financial-app-db-gateway-body", code)');
  expect(edge).not.toContain('return json({ error: error instanceof Error ? error.message');
  expect(edge).not.toContain('error instanceof Error ? error.message : String(error)');
  expect(edge).not.toContain('return json({ error: error instanceof Error ? error.message');
});


test("REC-SEC-GW-003 · Análisis nunca registra texto SQL ni errores remotos sin filtrar", () => {
  const source = readFileSync(join(process.cwd(),
    "app/api/analysis/source-freshness/route.ts"), "utf8");
  expect(source).toContain('import { publicGatewayErrorCode }');
  expect(source).toContain('code: publicGatewayErrorCode(error)');
  expect(source).toContain('publicGatewayErrorCode(new Error(error.code ?? "gateway_error"))');
  expect(source).not.toContain('error instanceof Error ? error.message : String(error)');
  expect(source).not.toContain('code: error.code ?? null');
  expect(publicGatewayErrorCode(new Error("invalid_account_id"))).toBe("invalid_account_id");
  expect(publicGatewayErrorCode(new Error("PostgreSQL details: IBAN ES000000"))).toBe("gateway_error");
});

test("REC-SEC-OCR-001 · errores PDF conocidos nunca revelan mensajes del documento", () => {
  const known = {
    InvalidPDFException: 422,
    PasswordException: 422,
    ocr_worker_timeout: 503,
  };
  const pdf = new Error("PDF rechazado: titular privado y referencia bancaria");
  pdf.name = "InvalidPDFException";
  expect(knownPublicErrorCode(pdf, known)).toBe("InvalidPDFException");

  const encrypted = new Error("Clave del documento: 123456");
  encrypted.name = "PasswordException";
  expect(knownPublicErrorCode(encrypted, known)).toBe("PasswordException");

  expect(knownPublicErrorCode(new Error("ocr_worker_timeout"), known)).toBe("ocr_worker_timeout");
  expect(knownPublicErrorCode(new Error("OCR Error: token privadísimo"), known)).toBeNull();
  expect(knownPublicErrorCode(new Error("toString"), known)).toBeNull();
  expect(knownPublicErrorCode({ name: "PasswordException", message: "secreto" }, known)).toBeNull();

  const api = readFileSync(join(process.cwd(), "app/api/documents/ocr/route.ts"), "utf8");
  expect(api).toContain("const code = knownPublicErrorCode(error, known)");
  expect(api).toContain("code }, { status: known[code], headers: HEADERS }");
  expect(api).not.toContain("code: error.message || error.name");
});


test("REC-SEC-GW-004 · error remoto del gateway nunca expone SQL, tokens ni datos bancarios", () => {
  expect(publicRemoteGatewayCode("document_not_found")).toBe("document_not_found");
  expect(publicRemoteGatewayCode("invalid_account_id")).toBe("invalid_account_id");
  expect(publicRemoteGatewayCode("gateway_error")).toBe("gateway_error");
  for (const code of ["method_not_allowed", "unauthorized",
    "preview_production_write_forbidden", "database_url_unavailable"]) {
    expect(publicRemoteGatewayCode(code)).toBe(code);
  }
  for (const unsafe of [
    "PostgresError: duplicate key IBAN ES7620770024003102575766",
    "Bearer eyJhbGciOiJIUzI1NiJ9.private-part",
    "invalid_account_id; SELECT * FROM financial_app.transactions",
    "document_storage_unavailable: token=secret",
    "workspace_1234567890123456789012",
  ]) expect(publicRemoteGatewayCode(unsafe)).toBe("gateway_error");
  for (const absent of [null, undefined, "", 5, { error: "invalid_account_id" }]) {
    expect(publicRemoteGatewayCode(absent)).toBeNull();
  }
  const gateway = readFileSync(join(process.cwd(),
    "src/infrastructure/persistence/vercel-supabase-gateway.ts"), "utf8");
  expect(gateway).toContain("const safeRemoteCode = publicRemoteGatewayCode(body?.error)");
  expect(gateway).toContain("safeRemoteCode ?? undefined");
  expect(gateway).not.toMatch(/response\.status,\s*body\?\.error,/);
  expect(gateway).not.toMatch(/response\.status,\s*body\.error,/);
});


test("REC-SEC-API-005 · las rutas financieras no convierten errores arbitrarios en códigos públicos", () => {
  const allowed = [
    "invalid_document_body", "unsupported_document_mime_type",
    "invalid_budget_month", "invalid_forecast_action",
    "invalid_recurrence_candidate_key", "invalid_transaction_tag",
    "invalid_comparison_period", "invalid_analysis_account",
  ];
  for (const code of allowed) expect(publicGatewayErrorCode(new Error(code))).toBe(code);
  for (const privateMessage of [
    "invalid_document_body: IBAN ES7620770024003102575766",
    "invalid_budget_month: SQL violation account_secret",
    "invalid_forecast_action\\nAuthorization: Bearer secret",
    "invalid_recurrence_candidate_key (SELECT * FROM movements)",
    "invalid_transaction_12345678901234567890",
    "invalid_document_" + "x".repeat(100),
  ]) expect(publicGatewayErrorCode(new Error(privateMessage))).toBe("gateway_error");

  const paths = [
    "app/api/documents/route.ts",
    "app/api/budgets/route.ts",
    "app/api/forecast/route.ts",
    "app/api/recurrences/route.ts",
    "app/api/transactions/route.ts",
    "app/api/financial/route.ts",
    "app/api/analysis/route.ts",
    "app/api/compare/route.ts",
    "app/api/documents/ocr-review/route.ts",
  ];
  for (const path of paths) {
    const route = readFileSync(join(process.cwd(), path), "utf8");
    expect(route, path).toContain("publicGatewayErrorCode(error)");
    if (path === "app/api/financial/route.ts") {
      expect(route).toContain("const legacyParameterCode = knownPublicErrorCode(error, {");
      for (const key of ["invalid_dateFrom", "invalid_dateTo", "invalid_accountId", "invalid_includeArchived"]) {
        expect(route).toContain(`${key}: 400`);
      }
    }
    expect(route, path).not.toMatch(/error\.message\.startsWith\("invalid_/);
    // BudgetSnapshotContractError has an explicit typed, non-user-controlled
    // domain message. The route handles it before the generic error guard.
    if (path === "app/api/budgets/route.ts") {
      expect(route).toContain("if (error instanceof BudgetSnapshotContractError)");
    } else {
      expect(route, path).not.toMatch(/code:\s*error\.message/);
    }
  }
});


test("REC-SEC-API-006 · códigos históricos exactos y líneas OCR indexadas conservan HTTP 400", () => {
  const explicit = {
    invalid_document_content_sha256: 400,
    invalid_document_expected_sha256: 400,
    invalid_transactionId: 400,
    invalid_dateFrom: 400,
    invalid_dateTo: 400,
    invalid_amountFromCents: 400,
    invalid_amountToCents: 400,
    invalid_cursorBankDate: 400,
    invalid_cursorId: 400,
    invalid_signMismatch: 400,
    invalid_categoryId: 400,
    invalid_accountId: 400,
    invalid_merchantId: 400,
    invalid_reviewState: 400,
    invalid_duplicateState: 400,
    invalid_internalTransfer: 400,
    invalid_hasDocument: 400,
    invalid_documentQuery: 400,
    invalid_splitLabel: 400,
    invalid_ocrQuery: 400,
  };
  for (const name of Object.keys(explicit)) {
    expect(knownPublicErrorCode(new Error(name), explicit)).toBe(name);
    expect(knownPublicErrorCode(new Error(name + ": bearer secret"), explicit)).toBeNull();
  }
  const doc = readFileSync(join(process.cwd(), "app/api/documents/route.ts"), "utf8");
  const tx = readFileSync(join(process.cwd(), "app/api/transactions/route.ts"), "utf8");
  const review = readFileSync(join(process.cwd(), "app/api/documents/ocr-review/route.ts"), "utf8");
  for (const route of [doc, tx]) {
    expect(route).toContain("knownPublicErrorCode(error, {");
    expect(route).toContain("?? publicGatewayErrorCode(error)");
  }
  expect(review).toContain("const indexedCode = error instanceof Error");
  expect(review).toContain("indexedCode ?? publicGatewayErrorCode(error)");
  const validLine = /^invalid_document_line_(?:0|[1-9]\d?|1\d{2})_(?:description|quantity|unit_price|total)$/;
  for (const code of [
    "invalid_document_line_0_description",
    "invalid_document_line_19_quantity",
    "invalid_document_line_199_unit_price",
  ]) expect(validLine.test(code)).toBe(true);
  for (const unsafe of [
    "invalid_document_line_200_description",
    "invalid_document_line_0_description: token",
    "invalid_document_line_01_quantity",
    "invalid_document_line_0_amount123",
  ]) expect(validLine.test(unsafe)).toBe(false);
});
