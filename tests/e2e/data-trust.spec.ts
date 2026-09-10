import { expect, test } from "@playwright/test";
import { DATA_TRUST_CAPABILITIES } from "../../src/domain/data-trust-contract";

const byId = (id: string) => DATA_TRUST_CAPABILITIES.find((capability) => capability.id === id);

test("PRE-020 · toda afirmación verificada tiene evidencia técnica versionada", () => {
  const verified = DATA_TRUST_CAPABILITIES.filter((capability) => capability.state === "verified");

  expect(verified.length).toBeGreaterThan(0);
  for (const capability of verified) {
    expect(capability.evidence.length, capability.id).toBeGreaterThan(0);
  }
});

test("PRE-020 · las capacidades pendientes siguen declaradas como no disponibles", () => {
  expect(byId("user-data-export")?.state).toBe("verified");
  expect(byId("workspace-deletion")?.state).toBe("not_available");
  expect(byId("commercial-retention")?.state).toBe("not_available");
  expect(byId("privacy-and-terms")?.state).toBe("not_available");
  expect(byId("support-and-service-status")?.state).toBe("not_available");
  expect(byId("operator-backup")?.state).toBe("operator_only");
});

test("PRE-020 · Datos y privacidad comunica estado real y expone sólo acciones verificadas", async ({ page }) => {
  await page.goto("/configuration/data");

  await expect(page.getByRole("heading", { name: "Datos y privacidad" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Datos y privacidad" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Verificado", { exact: true })).toHaveCount(4);
  await expect(page.getByText("Operación técnica", { exact: true })).toHaveCount(1);
  await expect(page.getByText("No disponible todavía", { exact: true })).toHaveCount(4);
  await expect(page.getByRole("link", { name: "Descargar mis datos" })).toHaveAttribute("href", "/api/data/export");
  await expect(page.getByRole("button", { name: /borrado completo/i })).toHaveCount(0);
  await expect(page.getByText(/no sustituye una política de privacidad/i)).toBeVisible();

  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).not.toContain("bank-grade");
  expect(body).not.toContain("100% seguro");
});
