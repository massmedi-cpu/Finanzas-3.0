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

test("PRE-020 · las capacidades de ciclo de datos inexistentes siguen declaradas como no disponibles", () => {
  expect(byId("user-data-export")?.state).toBe("not_available");
  expect(byId("workspace-deletion")?.state).toBe("not_available");
  expect(byId("commercial-retention")?.state).toBe("not_available");
  expect(byId("privacy-and-terms")?.state).toBe("not_available");
  expect(byId("support-and-service-status")?.state).toBe("not_available");
  expect(byId("operator-backup")?.state).toBe("operator_only");
});

test("PRE-020 · Datos y privacidad comunica estado real sin convertir pendientes en acciones", async ({ page }) => {
  await page.goto("/configuration/data");

  await expect(page.getByRole("heading", { name: "Datos y privacidad" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Datos y privacidad" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Verificado", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Operación técnica", { exact: true })).toHaveCount(1);
  await expect(page.getByText("No disponible todavía", { exact: true })).toHaveCount(5);
  await expect(page.getByRole("button", { name: /exportar mis datos/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /borrado completo/i })).toHaveCount(0);
  await expect(page.getByText(/no sustituye una política de privacidad/i)).toBeVisible();

  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).not.toContain("bank-grade");
  expect(body).not.toContain("100% seguro");
});
