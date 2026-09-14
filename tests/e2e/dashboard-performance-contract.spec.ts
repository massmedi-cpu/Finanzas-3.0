import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("Inicio · arquitectura, rendimiento y capa visual respetan el Axioma", async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "el contrato estructural se valida una vez por run",
  );

  const root = process.cwd();
  const gateway = readFileSync(
    join(root, "src/infrastructure/persistence/vercel-supabase-gateway.ts"),
    "utf8",
  );
  const route = readFileSync(join(root, "app/api/dashboard/route.ts"), "utf8");
  const home = readFileSync(join(root, "app/page.tsx"), "utf8");
  const client = readFileSync(join(root, "app/dashboard-client.tsx"), "utf8");
  const css = readFileSync(join(root, "app/dashboard.module.css"), "utf8");

  expect(gateway).toContain("callPersistenceGatewayBatch");
  expect(gateway).toContain("const context = await resolvePersistenceGatewayContext()");
  expect(gateway).toContain("Promise.allSettled");
  expect(route).toContain('scope === "primary"');
  expect(route).toContain('scope === "secondary"');
  expect(route).toContain("callPersistenceGatewayBatch");
  expect(route).toContain('"server-timing"');

  expect(home).not.toContain('dynamic = "force-dynamic"');
  expect(home).not.toContain("runCompleteFoundationHealthChecks");

  expect(client).toContain("/api/dashboard?scope=");
  expect(client).toContain("Ocultar importes");
  expect(client).toContain("merchant?.effectiveName");
  expect(client).not.toContain("quickNav");

  for (const token of [
    "--color-surface",
    "--color-border",
    "--color-text",
    "--color-primary-bright",
    "--color-success",
    "--color-warning",
    "--color-danger",
    "--font-page-title",
    "--font-section-title",
    "--font-kpi-primary",
    "--radius-panel",
  ]) {
    expect(css, `Inicio debe consumir ${token}`).toContain(`var(${token})`);
  }

  expect(css).not.toContain("backdrop-filter");
  expect(css).not.toContain("!important");
  expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
});
