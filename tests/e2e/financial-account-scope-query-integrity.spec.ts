import { expect, test } from "@playwright/test";
import { GET as analysisGet } from "../../app/api/analysis/route";
import { GET as freshnessGet } from "../../app/api/analysis/source-freshness/route";

// Privacy boundary assertions: all requests end in validation BEFORE the
// database gateway or account-specific bank data can be contacted.
for (const key of [
  "accountId", "month", "dateFrom", "dateTo",
  "compareDateFrom", "compareDateTo", "range",
]) {
  test("CAP-004 · Análisis rejects duplicate " + key + " rather than using first value", async () => {
    const url = new URL("https://isolated.local/api/analysis");
    url.searchParams.append(key, "first");
    url.searchParams.append(key, "second");
    const response = await analysisGet(new Request(url));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const result = await response.json();
    expect(result).toMatchObject({ error: "invalid_request", code: "invalid_analysis_parameter" });
  });
}

test("CAP-004 · source freshness rejects two account IDs before requesting bank bounds", async () => {
  const url = new URL("https://isolated.local/api/analysis/source-freshness");
  url.searchParams.append("accountId", "10000000-0000-4000-8000-000000000001");
  url.searchParams.append("accountId", "20000000-0000-4000-8000-000000000002");
  const response = await freshnessGet(new Request(url));
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ error: "invalid_parameter" });
});
