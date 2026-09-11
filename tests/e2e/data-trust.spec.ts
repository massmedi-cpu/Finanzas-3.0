import { expect, test } from "@playwright/test";
import { DATA_TRUST_CAPABILITIES, DATA_TRUST_REVIEW } from "../../src/domain/data-trust-contract";

const byId = (id: string) => DATA_TRUST_CAPABILITIES.find((capability) => capability.id === id);

test("PRE-020 · toda afirmación verificada tiene evidencia técnica versionada", () => {
  const verified = DATA_TRUST_CAPABILITIES.filter((capability) => capability.state === "verified");

  expect(verified.length).toBeGreaterThan(0);
  for (const capability of verified) {
    expect(capability.evidence.length, capability.id).toBeGreaterThan(0);
  }
});

test("scope monousuario · no expone capacidades de borrado o retención multiusuario", () => {
  expect(DATA_TRUST_REVIEW.scope).toContain("monousuario");
  expect(byId("user-data-export")?.state).toBe("verified");
  expect(byId("workspace-deletion")).toBeUndefined();
  expect(byId("commercial-retention")).toBeUndefined();
  expect(byId("privacy-and-terms")?.state).toBe("not_available");
  expect(byId("support-and-service-status")?.state).toBe("not_available");
  expect(byId("operator-backup")?.state).toBe("operator_only");
});

test("scope monousuario · Datos y privacidad comunica seguridad interna sin funciones multiusuario", async ({ page }) => {
  await page.goto("/configuration/data");

  await expect(page.getByRole("heading", { name: "Datos y privacidad" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Datos y privacidad" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Verificado", { exact: true })).toHaveCount(4);
  await expect(page.getByText("Operación técnica", { exact: true })).toHaveCount(1);
  await expect(page.getByText("No disponible todavía", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Descargar mis datos" })).toHaveAttribute("href", "/api/data/export");
  await expect(page.getByText(/diseñada para un único usuario/i)).toBeVisible();
  await expect(page.getByText(/no implica cuentas compartidas, equipos ni espacios de trabajo gestionables/i)).toBeVisible();

  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).not.toContain("borrado de datos del workspace");
  expect(body).not.toContain("borrado completo de datos");
  expect(body).not.toContain("política de retención");
  expect(body).not.toContain("bank-grade");
  expect(body).not.toContain("100% seguro");
});
