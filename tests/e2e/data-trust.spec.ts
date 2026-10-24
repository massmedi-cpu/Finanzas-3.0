import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { navigationItems } from "../../app/navigation-items";
import { DATA_TRUST_CAPABILITIES, DATA_TRUST_REVIEW } from "../../src/domain/data-trust-contract";

const byId = (id: string) => DATA_TRUST_CAPABILITIES.find((capability) => capability.id === id);

test("PRE-020 · toda afirmación verificada tiene evidencia técnica versionada", () => {
  const verified = DATA_TRUST_CAPABILITIES.filter((capability) => capability.state === "verified");

  expect(verified.length).toBeGreaterThan(0);
  for (const capability of verified) {
    expect(capability.evidence.length, capability.id).toBeGreaterThan(0);
  }
});

test("scope monousuario · sólo publica capacidades técnicas verificables", () => {
  expect(DATA_TRUST_REVIEW.scope).toContain("monousuario");
  expect(DATA_TRUST_REVIEW.contractVersion).toBe(6);
  expect(byId("user-data-export")?.state).toBe("verified");
  expect(byId("technical-privacy")?.state).toBe("verified");
  expect(byId("operator-service-health")?.state).toBe("operator_only");
  expect(byId("workspace-deletion")).toBeUndefined();
  expect(byId("commercial-retention")).toBeUndefined();
  expect(byId("privacy-and-terms")).toBeUndefined();
  expect(byId("support-and-service-status")).toBeUndefined();
  expect(byId("operator-backup")?.state).toBe("operator_only");
});

test("scope monousuario · Datos y privacidad comunica operación interna sin promesas comerciales ficticias", async ({ page }) => {
  await page.goto("/configuration/data");

  await expect(page.getByRole("heading", { name: "Datos y privacidad" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Datos y privacidad" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Verificado", { exact: true })).toHaveCount(5);
  await expect(page.getByText("Operación técnica", { exact: true })).toHaveCount(2);
  await expect(page.getByText("No disponible todavía", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Privacidad técnica" })).toBeVisible();
  await expect(page.getByText(/cookies estrictamente necesarias/i)).toBeVisible();
  await expect(page.getByText(/permisos de lectura para Sheets y metadatos de Drive/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operación y fiabilidad" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diagnóstico técnico del servicio" })).toBeVisible();
  await expect(page.getByText(/comprobaciones autenticadas para persistencia, calidad de datos y runtime/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Descargar mis datos" })).toHaveAttribute("href", "/api/data/export");
  await expect(page.getByText(/diseñada para un único usuario/i)).toBeVisible();
  await expect(page.getByText(/protege tus datos personales y mantiene la fuente bancaria original en solo lectura/i)).toBeVisible();

  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).not.toContain("borrado de datos del workspace");
  expect(body).not.toContain("borrado completo de datos");
  expect(body).not.toContain("política de retención");
  expect(body).not.toContain("política de privacidad");
  expect(body).not.toContain("condiciones comerciales definitivas");
  expect(body).not.toContain("página pública de estado");
  expect(body).not.toMatch(/\bsla\b/);
  expect(body).not.toContain("bank-grade");
  expect(body).not.toContain("100% seguro");
});


test("REC-OWNER-300 · menús de uso personal sin invitaciones ni gestión de otros usuarios", () => {
  const settings = readFileSync("app/configuration/configuration-area-nav.tsx", "utf8");
  const primary = readFileSync("app/navigation-items.ts", "utf8");
  const navigation = primary + "\n" + settings;
  expect(navigation).not.toMatch(/href:\s*["'][^"']*\/(?:members?|users?|invite|teams?|workspaces?|organizations?|roles?)(?:\/|["'])/i);
  expect(navigation).not.toMatch(/label:\s*["'][^"']*(?:invitar|miembros?|usuarios?|colaboradores?|equipos?|espacios de trabajo)[^"']*["']/i);
  expect(navigation).toContain('{ href: "/accounts", label: "Cuentas"');
  expect(settings).toContain('{ href: "/configuration", label: "Cuentas y categorías"');
  expect(navigationItems.some((item) => item.href === "/configuration")).toBe(true);
});

test("REC-OWNER-301 · pantalla personal sin controles ni promesas de multiusuario", async ({ page }) => {
  await page.goto("/configuration/data");
  await expect(page.getByRole("heading", { name: "Datos y privacidad" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acceso privado a mis datos" })).toBeVisible();
  const content = await page.locator("main").innerText();
  expect(content).toMatch(/diseñada para un único usuario/i);
  expect(content).not.toMatch(/multiusuario|espacios? de trabajo|workspaces?|miembros?|invitaciones?|invitar|colaboradores?|cuentas compartidas|cambiar de perfil/i);
  await expect(page.getByRole("button", { name: /invitar|gestionar miembros|añadir usuario|cambiar espacio|compartir acceso/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /invitar|gestionar miembros|añadir usuario|cambiar espacio|compartir acceso/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Descargar mis datos" })).toHaveAttribute("href", "/api/data/export");
});

test("REC-OWNER-302 · textos personales sin alterar protección ni contratos internos", () => {
  const source = readFileSync("app/configuration/source/source-overview-client.tsx", "utf8");
  const alternativeSource = readFileSync("app/configuration/source/source-client.tsx", "utf8");
  const privateData = readFileSync("app/configuration/data/workspace-deletion-panel.tsx", "utf8");
  const serverAuth = readFileSync("app/api/source/google/postflight/route.ts", "utf8");
  const logout = readFileSync("app/api/auth/logout/route.ts", "utf8");
  expect(source).not.toContain("Tu usuario no tiene acceso al espacio de trabajo");
  expect(source).toContain("La sesión actual no tiene acceso a esta fuente bancaria.");
  expect(alternativeSource).not.toContain("Tu usuario no tiene acceso al espacio de trabajo");
  expect(alternativeSource).toContain("La sesión actual no tiene acceso a esta fuente bancaria.");
  expect(privateData).not.toContain("<strong>Borrado de datos del workspace</strong>");
  expect(privateData).toContain("<strong>Borrado definitivo de mis datos</strong>");
  expect(serverAuth).toContain("requireVerifiedSourceWorkspace()");
  expect(logout).toContain("export async function POST");
});
