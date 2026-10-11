import { expect, test } from "@playwright/test";
import { dashboardRequiresWorkspaceSession } from "../../app/api/dashboard/route";
import { PersistenceGatewayError } from "../../src/infrastructure/persistence/vercel-supabase-gateway";

function fail(status: number, code: string): PromiseRejectedResult {
  return { status: "rejected", reason: new PersistenceGatewayError("Gateway unavailable", status, code) };
}

test("REC-PERF-040 · 401/403 de sesión en todas las fuentes es terminal, no un reintento", () => {
  expect(dashboardRequiresWorkspaceSession([
    fail(403, "workspace_context_required"),
    fail(401, "workspace_user_invalid"),
    fail(403, "workspace_access_denied"),
  ])).toBe(true);
  expect(dashboardRequiresWorkspaceSession([fail(403, "workspace_context_required"), {
    status: "fulfilled", value: { legitimate: true },
  }])).toBe(false);
  expect(dashboardRequiresWorkspaceSession([fail(503, "workspace_tenancy_unavailable")])).toBe(false);
  expect(dashboardRequiresWorkspaceSession([fail(403, "preview_production_write_forbidden")])).toBe(false);
  expect(dashboardRequiresWorkspaceSession([])).toBe(false);
});

test("REC-PERF-041 · Inicio no multiplica solicitudes bancarias ante sesión no autorizada", async ({ page }) => {
  const aggregate: string[] = [];
  const legacy: string[] = [];
  await page.route("**/api/dashboard?*", async route => {
    const url = new URL(route.request().url());
    aggregate.push(url.searchParams.get("scope") ?? "");
    await route.fulfill({
      status: 403, contentType: "application/json",
      body: JSON.stringify({ error: "workspace_session_required", code: "workspace_session_required" }),
    });
  });
  await page.route(/\/api\/(?:financial|transactions|budgets|forecast)(?:\?|$)/, async route => {
    legacy.push(route.request().url());
    await route.fulfill({ status: 403, json: { error: "workspace_session_required" } });
  });
  for (const routePath of ["/api/dashboard/analysis", "/api/analysis/source-freshness", "/api/source/google/sync"]) {
    await page.route(`**${routePath}`, async route =>
      route.fulfill({ status: 403, json: { error: "workspace_session_required" } }));
  }

  await page.goto("/");
  await expect(page.locator("main[aria-busy='true']")).toHaveCount(0);
  expect(aggregate.sort()).toEqual(["activity", "critical", "secondary"]);
  expect(legacy, "Una sesión ausente no justifica 5 consultas redundantes").toEqual([]);
  await expect(page.getByRole("region", { name: "Resumen financiero principal" })).toBeVisible();
  await expect(page.getByText("Presupuesto dentro del límite")).toHaveCount(0);
});
