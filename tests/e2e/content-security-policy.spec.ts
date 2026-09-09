import { expect, test } from "@playwright/test";

function directive(csp: string, name: string) {
  return csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `)) ?? "";
}

function nonceFrom(csp: string) {
  return csp.match(/'nonce-([^']+)'/)?.[1] ?? null;
}

test("G · CSP aplica una política estricta con nonce a las respuestas HTML", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBeLessThan(500);

  const csp = response.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).toContain("frame-ancestors 'none'");

  const scriptSrc = directive(csp, "script-src");
  expect(scriptSrc).toContain("'self'");
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).not.toContain("'unsafe-inline'");

  const nonce = nonceFrom(csp);
  expect(nonce).not.toBeNull();
  expect(nonce?.length ?? 0).toBeGreaterThanOrEqual(16);

  const html = await response.text();
  expect(html).toContain(`nonce="${nonce}"`);
});

test("G · CSP genera un nonce nuevo para cada documento HTML", async ({ request }) => {
  const first = await request.get("/login");
  const second = await request.get("/login");

  const firstNonce = nonceFrom(first.headers()["content-security-policy"] ?? "");
  const secondNonce = nonceFrom(second.headers()["content-security-policy"] ?? "");

  expect(firstNonce).not.toBeNull();
  expect(secondNonce).not.toBeNull();
  expect(firstNonce).not.toBe(secondNonce);
});
