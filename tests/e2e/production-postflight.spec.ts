import { expect, test } from "@playwright/test";
import { expectedProductionDocumentProfile, requiresDualProductionDomainCheck } from "../../src/domain/release-production-profile";

const EXPECTED_VERSION = process.env.EXPECTED_APP_VERSION?.trim() ?? "";
const EXPECTED_COMMIT = process.env.EXPECTED_COMMIT_SHA?.trim() ?? "";
const EXPECTED_DEPLOYMENT_ID = process.env.EXPECTED_DEPLOYMENT_ID?.trim() ?? "";

function requireReleaseIdentity() {
  expect(EXPECTED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  expect(EXPECTED_COMMIT).toMatch(/^[0-9a-f]{40}$/i);
  expect(EXPECTED_DEPLOYMENT_ID).toMatch(/^dpl_[A-Za-z0-9]+$/);
}

function expectExactCommit(value: unknown) {
  expect(typeof value).toBe("string");
  expect(value).toBe(EXPECTED_COMMIT);
}

test("identidad exacta del deployment de producción", async ({ request }) => {
  requireReleaseIdentity();

  const response = await request.get("/api/build", { failOnStatusCode: false });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"] ?? "").toContain("no-store");

  const build = await response.json() as Record<string, unknown>;
  expect(build.version).toBe(EXPECTED_VERSION);
  expect(build.targetVersion).toBe(EXPECTED_VERSION);
  expect(build.environment).toBe("production");
  expectExactCommit(build.commit);
  expect(build.deploymentId).toBe(EXPECTED_DEPLOYMENT_ID);

  // REC-REL-596/702/703: certify the exact production profile. 10.0.104
  // is deliberately deferred; every newer version must actually expose all
  // agreed capabilities. A green build from another SHA cannot substitute it.
  const expectedDocumentProfile = expectedProductionDocumentProfile(EXPECTED_VERSION);
  if (expectedDocumentProfile !== null) {
    expect(build.releaseFeatures,
      "Production must expose its exact frozen document/OCR launch profile"
    ).toEqual(expectedDocumentProfile);
  }
});

test("la aplicación privada redirige al acceso y las APIs quedan cerradas", async ({ page, request }) => {
  requireReleaseIdentity();
  const navigation = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(navigation?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Acceso privado" })).toBeVisible();
  await expect(page.locator("#main-content").getByText("Esta aplicación contiene información financiera personal.")).toBeVisible();

  const privateApi = await request.get("/api/transactions", { failOnStatusCode: false, maxRedirects: 0 });
  expect(privateApi.status()).toBe(401);
  expect(privateApi.headers()["cache-control"] ?? "").toContain("no-store");
  const body = await privateApi.json() as Record<string, unknown>;
  expect(body.error).toBe("authentication_required");
});

test("manifest, service worker e iconos PWA son públicos y coherentes", async ({ request }) => {
  requireReleaseIdentity();
  const manifestResponse = await request.get("/manifest.webmanifest", { failOnStatusCode: false });
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json() as Record<string, unknown>;
  expect(manifest.name).toBe("Financial App");
  expect(manifest.start_url).toBe("/");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.lang).toBe("es-ES");

  const serviceWorker = await request.get("/sw.js", { failOnStatusCode: false });
  expect(serviceWorker.status()).toBe(200);
  const serviceWorkerText = await serviceWorker.text();
  expect(serviceWorkerText).toContain("self.addEventListener");

  for (const icon of ["/pwa-icon-192.svg", "/pwa-icon-512.svg"]) {
    const response = await request.get(icon, { failOnStatusCode: false });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain("image/svg+xml");
  }
});

test("el acceso no desborda horizontalmente en el viewport certificado", async ({ page }) => {
  requireReleaseIdentity();
  const navigation = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(navigation?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Acceso privado" })).toBeVisible();

  // REC-REL-686: Google is the primary sign-in. The password button lives
  // inside a closed <details> and must not be expected visible initially.
  const googleLogin = page.getByRole("link", { name: "Continuar con Google" });
  await expect(googleLogin).toBeVisible();
  await expect(googleLogin).toHaveAttribute("href", /^\/api\/auth\/google\?next=/);
  const alternative = page.getByText("Acceso alternativo con contraseña", { exact: true });
  await expect(alternative).toBeVisible();
  await alternative.click();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test("cabeceras de seguridad esenciales permanecen activas", async ({ page }) => {
  requireReleaseIdentity();
  const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"] ?? "").toContain("default-src 'self'");
  expect(headers["content-security-policy"] ?? "").toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"] ?? "").toContain("object-src 'none'");
});


/**
 * REC-REL-677: financialapp-home.vercel.app is a deployment-level alias,
 * whereas finanzas-3-0.vercel.app is a project domain. Promotion/rollback
 * must not leave the two public entry points on different deployments.
 * Compare immutable IDs instead of just an HTTP 200 or a matching title.
 * Applies to 10.0.104 AND every future complete release. Earlier
 * production versions retain their historical postflight behavior.
 */
test("REC-REL-677 · los dos dominios públicos apuntan al mismo deployment final", async ({ request }) => {
  requireReleaseIdentity();
  if (!requiresDualProductionDomainCheck(EXPECTED_VERSION)) test.skip();

  const origins = [
    "https://finanzas-3-0.vercel.app",
    "https://financialapp-home.vercel.app",
  ] as const;
  for (const origin of origins) {
    const response = await request.get(origin + "/api/build", {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    expect(response.status(), origin + " must serve a successful build identity").toBe(200);
    expect(new URL(response.url()).origin, origin + " must not redirect to a different hostname").toBe(origin);
    expect(response.headers()["cache-control"] ?? "", origin + " must not cache release identity").toContain("no-store");

    const build = await response.json() as Record<string, unknown>;
    expect(build.version, origin + " version").toBe(EXPECTED_VERSION);
    expect(build.targetVersion, origin + " target version").toBe(EXPECTED_VERSION);
    expect(build.environment, origin + " runtime environment").toBe("production");
    expect(build.commit, origin + " exact Git SHA").toBe(EXPECTED_COMMIT);
    expect(build.deploymentId, origin + " exact Vercel deployment").toBe(EXPECTED_DEPLOYMENT_ID);
    expect(build.releaseFeatures, origin + " exact release document/OCR profile")
      .toEqual(expectedProductionDocumentProfile(EXPECTED_VERSION));
  }
});
