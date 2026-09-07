import { expect, test } from "@playwright/test";

test("las respuestas HTML aplican el hardening de navegador seguro del bloque A", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBeLessThan(500);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response.headers()["permissions-policy"]).toContain("geolocation=()");
  expect(response.headers()["permissions-policy"]).toContain("microphone=()");
  expect(response.headers()["permissions-policy"]).toContain("payment=()");
  expect(response.headers()["permissions-policy"]).toContain("usb=()");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});
