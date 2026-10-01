import { expect, test } from "@playwright/test";

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
});

test("la aplicación privada redirige al acceso y las APIs quedan cerradas", async ({ page, request }) => {
  requireReleaseIdentity();
  const navigation = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(navigation?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Acceso privado" })).toBeVisible();
  await expect(page.getByText("Esta aplicación contiene información financiera personal.")).toBeVisible();

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
