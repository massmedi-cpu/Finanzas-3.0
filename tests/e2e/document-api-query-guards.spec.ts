import { expect, test } from "@playwright/test";
import { GET as getDocuments } from "../../app/api/documents/route";
import {
  PATCH as reviewOcr,
  errorResponse as ocrReviewError,
} from "../../app/api/documents/ocr-review/route";

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

test("REC-OCR-REVIEW-055 · review submission rejects malformed JSON with clear status", async () => {
  const response = await reviewOcr(new Request("https://test.local/api/documents/ocr-review", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: "{not-json}",
  }));
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
