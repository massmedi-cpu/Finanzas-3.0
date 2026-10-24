import { expect, test } from "@playwright/test";

const bankAccountA = "a0d30000-0000-4000-8000-000000000001";
const bankAccountB = "a0d30000-0000-4000-8000-000000000002";

// Unlike isolated frontend mocks, these assertions reach the real API route
// and stop before the persistence gateway; no banking records are modified.
test("REC-TXN-020 · repeated banking filters never select a silent first value", async ({ request }) => {
  const malformed = [
    `/api/transactions?accountId=${bankAccountA}&accountId=${bankAccountB}`,
    "/api/transactions?year=2026&year=2025",
    "/api/transactions?limit=50&limit=1",
    "/api/transactions?mode=facets&mode=split",
    "/api/transactions?q=factura&q=salario",
    `/api/transactions?cursorId=${bankAccountA}&cursorId=${bankAccountB}`,
    "/api/transactions?dateFrom=2026-09-01&dateFrom=2026-10-01",
  ];
  for (const url of malformed) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request", code: "invalid_transaction_query_duplicate",
    });
  }
});
