import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const documents = [
  { id: "93000000-0000-4000-8000-000000000091", originalFileName: "Justificante pendiente.pdf", type: "invoice", status: "pending_review", mimeType: "application/pdf", documentDate: "2026-09-12", totalCents: 1000, associationCount: 0 },
  { id: "93000000-0000-4000-8000-000000000092", originalFileName: "Justificante asociado.pdf", type: "invoice", status: "confirmed", mimeType: "application/pdf", documentDate: "2026-09-12", totalCents: 2000, associationCount: 1 },
  { id: "93000000-0000-4000-8000-000000000093", originalFileName: "Archivo archivado.pdf", type: "invoice", status: "archived", mimeType: "application/pdf", documentDate: "2026-09-12", totalCents: 3000, associationCount: 0 },
];

test("AUD-E2E-NAV-001 · alertas documentales enlazan a estados propios", () => {
  const alerts = readFileSync(resolve("src/application/global-alerts.ts"), "utf8");
  expect(alerts).toContain('href: "/documents?unassociated=true"');
  expect(alerts).toContain('href: "/documents?status=pending_review"');
});

test("AUD-E2E-NAV-001 · sin asociar filtra todos los resultados y permite recuperar el listado", async ({ page }) => {
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get("status");
    const filtered = status ? documents.filter((item) => item.status === status) : documents;
    const offset = Number(url.searchParams.get("offset") || "0");
    const limit = Number(url.searchParams.get("limit") || "50");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      contractVersion: 1, total: filtered.length, limit, offset, items: filtered.slice(offset, offset + limit),
    }) });
  });
  await page.goto("/documents?unassociated=true");
  await expect(page.getByLabel("Asociación")).toHaveValue("unassociated");
  await expect(page.getByText("Justificante pendiente.pdf")).toBeVisible();
  await expect(page.getByText("Justificante asociado.pdf")).toHaveCount(0);
  await expect(page.getByText("Archivo archivado.pdf")).toHaveCount(0);
  await page.getByLabel("Asociación").selectOption("all");
  await expect(page.getByText("Justificante asociado.pdf")).toBeVisible();
  await page.goto("/documents?status=pending_review");
  await expect(page.getByLabel("Estado")).toHaveValue("pending_review");
  await expect(page.getByText("Justificante pendiente.pdf")).toBeVisible();
});
