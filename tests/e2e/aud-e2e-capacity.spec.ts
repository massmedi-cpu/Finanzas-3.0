import fs from "node:fs/promises";
import os from "node:os";
import { expect, test } from "@playwright/test";

const isolated = process.env.AUD_ISOLATED_DIR;
if (process.env.GITHUB_ACTIONS !== "true" || process.env.AUD_ISOLATED_SUITE !== "capacity" || !isolated) {
  throw new Error("isolated_capacity_suite_required");
}
const samples = 12, warmups = 2;
const budget = { api: 2000, desktopNavigation: 1000, mobileNavigation: 1500 };
type Fixture = { volume: number; accountId: string };
function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.ceil(p * sorted.length) - 1];
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { samples: sorted.length, medianMs, p95LabMs: at(.95), maxMs: at(1) };
}
// Independent reference: no application engine or SQL aggregation under test.
function reference(volume: number, from: string, to: string) {
  const result = { count: 0, search: 0, included: 0, income: 0, expense: 0, net: 0 };
  for (let n = 1; n <= volume; n++) {
    const date = new Date(Date.UTC(2022, 0, 1 + n % 1700)).toISOString().slice(0, 10);
    if (date < from || date > to) continue;
    result.count++;
    if (n % 17 === 0) result.search++;
    if (n % 31 === 0) continue;
    result.included++;
    if (n % 13 === 0) continue; // Internal transfer does not enter operating net.
    if (n % 23 === 0) result.net += 1999;
    else if (n % 10 === 0) { result.income += 200000; result.net += 200000; }
    else { result.expense += 100 + n % 9700; result.net -= 100 + n % 9700; }
  }
  return result;
}

test("AP6 optimized authenticated API and browser read capacity, independent 10k/50k totals", async ({ page, browserName, browser }) => {
  test.setTimeout(900_000);
  const context = JSON.parse(await fs.readFile(`${isolated}/context.json`, "utf8"));
  const state: { fixtures: Fixture[]; postgres: string } = JSON.parse(await fs.readFile(`${isolated}/capacity.json`, "utf8"));
  const login = await page.request.post("/api/auth/login", { data: { email: context.owner.email, password: context.owner.password } });
  expect(login.status()).toBe(200);
  const records: Array<Record<string, unknown>> = [];
  const report = {
    scope: "disposable_local_authenticated_optimized_next", sha: process.env.AUD_VALIDATION_SHA,
    synthetic: true, cloudAccess: false, ingestionCertified: false, fieldCoreWebVitalsCertified: false,
    network: "loopback; no network or CPU throttling; service worker disabled",
    browser: `${browserName} ${browser.version()}`, node: process.version,
    postgres: state.postgres, cpu: os.cpus()[0]?.model, memoryBytes: os.totalmem(),
    samples, warmups, budget, percentile: "nearest rank p95 of 12 laboratory samples", records,
  };
  await fs.mkdir("capacity-evidence", { recursive: true });
  const persist = () => fs.writeFile("capacity-evidence/authenticated-read-capacity.json", JSON.stringify(report, null, 2));
  const get = async (url: string) => {
    const started = performance.now();
    const response = await page.request.get(url, { timeout: 30_000 });
    const body = await response.json(); // Include body transfer and JSON decoding.
    expect(response.status(), url.split("?")[0]).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    return { body, elapsed: performance.now() - started, serverTiming: response.headers()["server-timing"] };
  };
  try {
    for (const fixture of state.fixtures) {
      for (const [period, from, to] of [["history", "2022-01-01", "2026-08-31"], ["month", "2026-06-01", "2026-06-30"]]) {
        const expected = reference(fixture.volume, from, to);
        for (const operation of ["aggregate", "list", "search"]) {
          const params = new URLSearchParams({ accountId: fixture.accountId, dateFrom: from, dateTo: to });
          if (operation === "aggregate") params.set("mode", "period");
          else params.set("limit", "50");
          if (operation === "search") params.set("q", "CAPACITY SEARCH");
          const url = `/api/${operation === "aggregate" ? "financial" : "transactions"}?${params}`;
          const durations: number[] = [], handlerDurations: number[] = [];
          for (let i = -warmups; i < samples; i++) {
            const result = await get(url), body = result.body;
            if (operation === "aggregate") {
              expect(body.accountId).toBe(fixture.accountId);
              expect(body.quality.scopedRows).toBe(expected.count);
              expect(body.quality.includedRows).toBe(expected.included);
              expect([body.incomeCents, body.expenseCents, body.operatingNetCents]).toEqual([expected.income, expected.expense, expected.net]);
            } else {
              const count = operation === "search" ? expected.search : expected.count;
              expect(body.totalCount).toBe(count);
              expect(body.rows).toHaveLength(Math.min(50, count));
              expect(new Set(body.rows.map((r: any) => r.id)).size).toBe(body.rows.length);
              for (const row of body.rows) {
                expect(row.account.id).toBe(fixture.accountId);
                expect(row.bankDate >= from && row.bankDate <= to).toBe(true);
                if (operation === "search") expect(row.concept.effective).toContain("CAPACITY SEARCH");
              }
            }
            if (i >= 0) {
              durations.push(result.elapsed);
              const handlerMs = result.serverTiming?.match(/financial;dur=([\d.]+)/)?.[1];
              if (handlerMs) handlerDurations.push(Number(handlerMs));
            }
          }
          const metric = { stage: "api", volume: fixture.volume, period, operation, ...stats(durations),
            handler: handlerDurations.length ? stats(handlerDurations) : null, budgetMs: budget.api };
          records.push(metric); await persist();
          console.log(`AUD_CAPACITY|${JSON.stringify(metric)}`);
          expect.soft(metric.p95LabMs, `${fixture.volume} ${period} ${operation} API p95`).toBeLessThanOrEqual(budget.api);
        }
      }
      // The browser renders the actual 50-row page, not all 50k records.
      // Cache-cold first load is reported separately, never discarded as warmup.
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const timings: number[] = [];
        for (let i = -1; i < samples; i++) {
          if (i === -1) { const cdp = await page.context().newCDPSession(page); await cdp.send("Network.clearBrowserCache"); await cdp.detach(); }
          const data = page.waitForResponse(response => {
            const url = new URL(response.url());
            return url.pathname === "/api/transactions" && url.searchParams.get("accountId") === fixture.accountId && !url.searchParams.has("mode");
          });
          const started = performance.now();
          await page.goto(`/transactions?accountId=${fixture.accountId}&dateFrom=2026-06-01&dateTo=2026-06-30`, { waitUntil: "domcontentloaded" });
          const response = await data;
          expect(response.status()).toBe(200);
          const result = await response.json();
          expect(result.totalCount).toBe(reference(fixture.volume, "2026-06-01", "2026-06-30").count);
          await expect(page.locator("[data-transaction-id]")).toHaveCount(50);
          await expect(page.getByTestId(`edit-${result.rows[0].id}`)).toBeEnabled();
          const elapsed = performance.now() - started;
          if (i === -1) {
            records.push({ stage: "browser_cache_cold", volume: fixture.volume, width, elapsedMs: elapsed });
          } else timings.push(elapsed);
        }
        const metric = { stage: "browser_document_navigation_warm_cache", volume: fixture.volume, width, ...stats(timings) };
        records.push(metric); await persist(); console.log(`AUD_CAPACITY|${JSON.stringify(metric)}`);
        // Document navigation is recorded, not mislabeled as in-memory SPA
        // navigation. The API gate above is enforced; SPA/INP needs its own run.
      }
    }
    const foreignLogin = await browser.newContext({ baseURL: "http://localhost:3000" });
    try {
      expect((await foreignLogin.request.post("/api/auth/login", { data: { email: context.foreign.email, password: context.foreign.password } })).status()).toBe(200);
      const denied = await foreignLogin.request.get(`/api/transactions?accountId=${state.fixtures[1].accountId}&limit=50`);
      expect(denied.status()).toBe(200); expect((await denied.json()).rows).toEqual([]);
    } finally { await foreignLogin.close(); }
  } finally { await persist(); }
});
