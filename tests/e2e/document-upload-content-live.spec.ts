import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

test("PRE-006 protected preview rejects forged PDF bytes before document registration", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  const unique = `pre006-fake-${crypto.randomUUID()}.pdf`;
  const forged = new TextEncoder().encode("MZ executable-like bytes, deliberately not a PDF");

  const signResponse = await request.post("/api/documents", {
    data: {
      action: "upload_sign",
      type: "invoice",
      originalFileName: unique,
      mimeType: "application/pdf",
      sizeBytes: forged.byteLength,
    },
  });
  expect(signResponse.status()).toBe(200);
  const sign = await signResponse.json();
  expect(typeof sign.signedUrl).toBe("string");
  expect(typeof sign.path).toBe("string");

  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new File([forged], unique, { type: "application/pdf" }));
  const upload = await fetch(sign.signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "false" },
    body: form,
    redirect: "error",
  });
  expect(upload.ok).toBe(true);

  const finalize = await request.post("/api/documents", {
    data: {
      action: "upload_finalize",
      type: "invoice",
      originalFileName: unique,
      mimeType: "application/pdf",
      path: sign.path,
    },
  });
  expect(finalize.status()).toBe(409);
  await expect(finalize.json()).resolves.toEqual({
    error: "conflict",
    code: "document_upload_content_mismatch",
  });

  const list = await request.get(`/api/documents?q=${encodeURIComponent(unique)}&limit=20&offset=0`);
  expect(list.status()).toBe(200);
  const listBody = await list.json();
  expect(listBody.total).toBe(0);
  expect(listBody.items).toEqual([]);

  const secondFinalize = await request.post("/api/documents", {
    data: {
      action: "upload_finalize",
      type: "invoice",
      originalFileName: unique,
      mimeType: "application/pdf",
      path: sign.path,
    },
  });
  expect(secondFinalize.status()).toBe(404);
  await expect(secondFinalize.json()).resolves.toEqual({
    error: "not_found",
    code: "document_upload_not_found",
  });
});
