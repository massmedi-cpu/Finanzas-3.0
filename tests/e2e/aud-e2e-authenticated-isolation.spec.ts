import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { interpretDocumentOcrFinancially } from "../../src/domain/document-ocr-financial-interpretation";
import { TesseractImageOcrProvider } from "../../src/infrastructure/ocr/tesseract-image-provider";

const dir = process.env.AUD_ISOLATED_DIR;
if (!dir) throw new Error("isolated_runtime_required");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseOrigin = new URL(supabaseUrl);
if (supabaseOrigin.hostname !== "127.0.0.1" || supabaseOrigin.protocol !== "http:") {
  throw new Error("cloud_runtime_forbidden");
}
const contextFile = `${dir}/context.json`;
const localUrl = (value: string) => {
  const url = new URL(value);
  if (url.origin !== supabaseOrigin.origin || url.username || url.password) throw new Error("nonlocal_storage_url");
  return url.toString();
};

test("real app login rejects anonymous/unauthorized users and renews actual Supabase cookies", async ({ page, request }) => {
  const context = JSON.parse(await fs.readFile(contextFile, "utf8"));
  const probe = "/api/__aud_isolated_auth_probe"; // No route: authenticated 404 vs proxy 401.
  expect((await request.get(probe)).status()).toBe(401);
  const denied = await request.post("/api/auth/login", { data: {
    email: context.denied.email, password: context.denied.password,
  } });
  expect(denied.status()).toBe(403);
  const login = await request.post("/api/auth/login", { data: {
    email: context.owner.email, password: context.owner.password,
  } });
  expect(login.status()).toBe(200);
  const cookies = (await request.storageState()).cookies;
  for (const name of ["financial_app_access", "financial_app_refresh"]) {
    expect(cookies.find((cookie) => cookie.name === name)?.httpOnly).toBe(true);
  }
  expect((await request.get(probe)).status()).toBe(404);

  await page.context().addCookies(cookies.filter((cookie) => cookie.name === "financial_app_refresh"));
  const renewed = await page.request.get(probe);
  expect(renewed.status()).toBe(404);
  expect((await page.context().cookies()).some((cookie) => cookie.name === "financial_app_access")).toBe(true);
  expect((await page.request.post("/api/auth/logout")).status()).toBe(200);
  expect((await page.request.get(probe)).status()).toBe(401);
});

test("synthetic ticket crosses real private Storage and the canonical OCR engine", async ({ page }) => {
  test.setTimeout(120_000);
  const context = JSON.parse(await fs.readFile(contextFile, "utf8"));
  await page.setContent(`<html lang="es"><body style="margin:0;background:white;color:black;font-family:Arial,sans-serif">
    <main style="width:760px;padding:40px;box-sizing:border-box">
      <h1 style="font-size:38px">FINANCIAL APP TEST</h1><h2 style="font-size:34px">TICKET SINTETICO</h2>
      <p style="font-size:30px">08/10/2026</p>
      <div style="font-size:34px;line-height:1.9">
        <div style="display:flex;justify-content:space-between"><span>ARTICULO A</span><span>10,00 EUR</span></div>
        <div style="display:flex;justify-content:space-between"><span>ARTICULO B</span><span>9,00 EUR</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold"><span>TOTAL</span><span>19,00 EUR</span></div>
      </div><p style="font-size:24px">SIN DATOS PERSONALES</p>
    </main></body></html>`);
  const png = await page.locator("main").screenshot({ type: "png" });
  const uploaded = await fetch(localUrl(context.upload.signedUrl), {
    method: "PUT", headers: { "content-type": "image/png" }, body: png,
  });
  expect(uploaded.status).toBe(200);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""; // Disposable localhost only.
  const signed = await fetch(`${supabaseUrl}/storage/v1/object/sign/${context.upload.bucket}/${context.upload.path}`, {
    method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: 120 }),
  });
  expect(signed.status).toBe(200);
  const signedBody = await signed.json();
  const downloadUrl = new URL(`/storage/v1${signedBody.signedURL}`, supabaseUrl).toString();
  const downloaded = await fetch(localUrl(downloadUrl), { redirect: "error" });
  expect(downloaded.status).toBe(200);
  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  const sha256 = (input: Uint8Array) => createHash("sha256").update(input).digest("hex");
  expect(sha256(bytes)).toBe(sha256(png));
  const rawResult = await runDocumentOcr({ documentId: context.documentId, bytes,
    mimeType: "image/png", originalFileName: "AUD-synthetic-ticket.png", provider: new TesseractImageOcrProvider() });
  expect(rawResult.extractor).toBe("tesseract-js-7.0.0-spa");
  expect(rawResult.plainText).toContain("19,00");
  expect(rawResult.plainText.toUpperCase()).toContain("TOTAL");
  expect(rawResult.principles.financialWrites).toBe(false);
  expect(rawResult.pages[0].lines.some((line) => line.words.some((word) => word.box.x > 0.55))).toBe(true);
  const interpretation = interpretDocumentOcrFinancially(rawResult);
  await fs.writeFile(`${dir}/ocr.json`, JSON.stringify({ rawResult, interpretation, sourceSha256: sha256(bytes) }), { mode: 0o600 });
});
