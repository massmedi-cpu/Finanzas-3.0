import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { GET as getDocuments } from "../../app/api/documents/route";
import { errorResponse as ocrReviewError } from "../../app/api/documents/ocr-review/route";
import { LimitedJsonRequestError, readLimitedJsonRequest } from "../../src/infrastructure/http/limited-json-request";

const ID = "93000000-0000-4000-8000-000000000117";

test("REC-DOC-QUERY-021 · private document modes reject extra selectors before gateway", async () => {
  const malformed: Array<[string, string]> = [
    [`id=${ID}&mode=open&status=confirmed`, "invalid_document_query_parameters"],
    [`id=${ID}&mode=open&q=otro`, "invalid_document_query_parameters"],
    [`id=${ID}&scope=tests`, "invalid_document_query_parameters"],
    [`id=${ID}&mode=candidates&offset=100`, "invalid_document_query_parameters"],
    [`id=${ID}&mode=candidates&scope=all`, "invalid_document_query_parameters"],
    ["mode=open", "invalid_document_mode"],
    ["mode=candidates&days=7", "invalid_document_mode"],
    ["q=factura&unknown=1", "invalid_document_query_parameters"],
    ["q=factura&q=factura", "invalid_document_query_duplicate"],
    [`id=${ID}&id=${ID}`, "invalid_document_query_duplicate"],
    [`id=${ID}&mode=bad`, "invalid_document_mode"],
  ];
  for (const [query, code] of malformed) {
    const response = await getDocuments(new Request(`https://test.local/api/documents?${query}`));
    expect(response.status, query).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json(), query).toMatchObject({ error: "invalid_request", code });
  }
});

test("REC-OCR-REVIEW-055 · authenticated JSON parser preserves 400 mapping for malformed data", async () => {
  const input = new Request("https://test.local/api/documents/ocr-review", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: "{not-json}",
  });
  await expect(readLimitedJsonRequest(input, 256 * 1024))
    .rejects.toMatchObject({ reason: "invalid_json" });
  const response = ocrReviewError(new LimitedJsonRequestError("invalid_json"));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid_request", code: "invalid_json" });
});

test("REC-OCR-REVIEW-056 · unexpected errors do not disclose document content", async () => {
  const privateDetail = "bank account SECRET-ACC had an OCR provider failure";
  const response = ocrReviewError(new Error(privateDetail));
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body).toEqual({ error: "internal_error", code: null });
  expect(JSON.stringify(body)).not.toContain(privateDetail);
  const validation = ocrReviewError(new Error("invalid_document_line_items"));
  expect(validation.status).toBe(400);
  await expect(validation.json()).resolves.toMatchObject({ code: "invalid_document_line_items" });
});


test("REC-DOC-AUTH-225 · el historial OCR exige workspace antes de consultar documento", () => {
  const source = readFileSync("app/api/documents/ocr-review/route.ts", "utf8");
  const get = source.slice(source.indexOf("export async function GET("), source.indexOf("export async function PATCH("));
  const verifyMembership = get.indexOf("await requireVerifiedSourceWorkspace()");
  const firstDocumentSelector = get.indexOf("url.searchParams.getAll");
  const gatewayHistory = get.indexOf('callPersistenceGateway("document.ocr_history"');
  expect(verifyMembership).toBeGreaterThan(0);
  expect(get).toContain("if (denied) return denied;");
  expect(firstDocumentSelector).toBeGreaterThan(verifyMembership);
  expect(gatewayHistory).toBeGreaterThan(firstDocumentSelector);
});


test("REC-DOC-AUTH-226 · PATCH anónimo no distingue JSON válido de inválido", async ({ request }) => {
  const cases = [
    "{not-json}",
    JSON.stringify({ documentId: ID, type: "ticket", totalCents: 1234 }),
  ];
  for (const body of cases) {
    const response = await request.patch("/api/documents/ocr-review", {
      headers: { "content-type": "application/json" }, data: body,
    });
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  }
});

test("REC-DOC-AUTH-227 · PATCH verifies membership before body parsing or write", () => {
  const source = readFileSync("app/api/documents/ocr-review/route.ts", "utf8");
  const patch = source.slice(source.indexOf("export async function PATCH("));
  const verify = patch.indexOf("await requireVerifiedSourceWorkspace()");
  const deny = patch.indexOf("if (denied) return denied;");
  const parse = patch.indexOf("await readLimitedJsonRequest(request, MAX_REVIEW_JSON_BYTES)");
  const write = patch.indexOf('callPersistenceGateway("document.ocr_confirm"');
  expect(verify).toBeGreaterThan(0);
  expect(deny).toBeGreaterThan(verify);
  expect(parse).toBeGreaterThan(deny);
  expect(write).toBeGreaterThan(parse);
});
