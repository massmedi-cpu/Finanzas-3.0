import { expect, test } from "@playwright/test";
import { GET } from "../../app/api/financial/route";

// These requests stop at validation: no login, gateway, bank data, or writes.
for (const scenario of [
  { name: "unknown mode", url: "https://test.local/api/financial?mode=not_a_mode", code: "invalid_mode" },
  { name: "invalid date", url: "https://test.local/api/financial?mode=period&dateFrom=2026-02-30", code: "invalid_dateFrom" },
  { name: "reverse range", url: "https://test.local/api/financial?mode=monthly&dateFrom=2026-10-09&dateTo=2026-10-01", code: "invalid_financial_date_range" },
]) {
  test("CAP-002 · financial API timing is present for safe " + scenario.name + " validation errors", async () => {
    const response = await GET(new Request(scenario.url));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    const timing = response.headers.get("server-timing");
    expect(timing).toMatch(/^financial;dur=\d+(?:\.\d+)?$/);
    const duration = Number(timing!.split("=")[1]);
    expect(Number.isFinite(duration)).toBe(true);
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(duration).toBeLessThan(2000);
    const body = await response.json();
    expect(body.error).toBe("invalid_request");
    expect(body.code).toBe(scenario.code);
    expect(timing).not.toMatch(/account|date|amount|source|user|token/i);
  });
}
