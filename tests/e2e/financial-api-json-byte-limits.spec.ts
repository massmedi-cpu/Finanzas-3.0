import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

type Route = { path: string; methods: Array<"POST" | "PATCH" | "PUT">; maxBytes: number; code: string };
const routes: Route[] = [
  { path: "forecast", methods: ["POST", "PATCH"], maxBytes: 64 * 1024, code: "forecast_body_too_large" },
  { path: "budgets", methods: ["POST", "PATCH"], maxBytes: 64 * 1024, code: "budget_body_too_large" },
  { path: "recurrences", methods: ["POST", "PATCH"], maxBytes: 64 * 1024, code: "recurrence_body_too_large" },
  { path: "transactions", methods: ["POST", "PUT", "PATCH"], maxBytes: 512 * 1024, code: "transaction_body_too_large" },
  { path: "rules", methods: ["POST"], maxBytes: 128 * 1024, code: "rule_body_too_large" },
  { path: "merchants", methods: ["POST"], maxBytes: 128 * 1024, code: "merchant_body_too_large" },
  { path: "configuration", methods: ["POST"], maxBytes: 128 * 1024, code: "configuration_body_too_large" },
];

test("REC-FIN-JSON-001 · all write operations protect the byte stream before parsing", () => {
  for (const route of routes) {
    const source = readFileSync(join(process.cwd(), "app/api", route.path, "route.ts"), "utf8");
    const guardedParses = source.match(/readLimitedJsonRequest\(request, MAX_MUTATION_JSON_BYTES\)/g) ?? [];
    expect(guardedParses.length, route.path).toBe(route.methods.length);
    expect(source, route.path).not.toContain("request.json()");
    expect(source, route.path).toContain("if (error instanceof LimitedJsonRequestError)");
    expect(source, route.path).toContain(route.code);
    expect(source, route.path).toContain("status: tooLarge ? 413 : 400");
  }
});

for (const route of routes) {
  test(`REC-FIN-JSON-002 · ${route.path} rejects oversized writes before gateway`, async ({ request }) => {
    const oversized = JSON.stringify({ action: "invalid", filler: "x".repeat(route.maxBytes + 1) });
    for (const method of route.methods) {
      const response = await request.fetch(`/api/${route.path}`, {
        method,
        headers: { "content-type": "application/json" },
        data: oversized,
      });
      expect(response.status(), method + " " + route.path).toBe(413);
      await expect(response.json()).resolves.toEqual({ error: "invalid_request", code: route.code });
    }
  });
}

test("REC-FIN-JSON-003 · invalid JSON in financial write routes remains HTTP 400", async ({ request }) => {
  for (const route of routes) {
    const response = await request.fetch(`/api/${route.path}`, {
      method: route.methods[0],
      headers: { "content-type": "application/json" },
      data: '{"malformed":',
    });
    expect(response.status(), route.path).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request", code: "invalid_json" });
  }
});
