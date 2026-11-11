import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import { GET as begin } from "../../app/api/auth/google/route";
import { GET as callback } from "../../app/api/auth/google/callback/route";
import { AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE } from "../../src/infrastructure/auth/access-control";

const originalFetch = global.fetch;
const originalEnforce = process.env.FINANCIAL_APP_AUTH_ENFORCED;
const originalVercelEnv = process.env.VERCEL_ENV;
test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalEnforce === undefined) delete process.env.FINANCIAL_APP_AUTH_ENFORCED;
  else process.env.FINANCIAL_APP_AUTH_ENFORCED = originalEnforce;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
});

function requestToCallback(started: Response, code = "synthetic-code") {
  const provider = new URL(started.headers.get("location")!);
  const target = new URL(provider.searchParams.get("redirect_to")!);
  target.searchParams.set("code", code);
  const cookie = started.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  return new NextRequest(target.toString(), { headers: { cookie } });
}

test("Google is a public authentication route but private financial API remains guarded", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "production";
  const startGate = await proxy(new NextRequest("https://financialapp.test/api/auth/google"));
  const callbackGate = await proxy(new NextRequest("https://financialapp.test/api/auth/google/callback"));
  const privateGate = await proxy(new NextRequest("https://financialapp.test/api/transactions"));
  expect(startGate.status).toBe(200);
  expect(callbackGate.status).toBe(200);
  expect(privateGate.status).toBe(401);
});

test("Google start uses short-lived HttpOnly state and PKCE; return URL stays local", async () => {
  const response = await begin(new NextRequest("https://financialapp.test/api/auth/google?next=%2Ftransactions%3Fmonth%3D2026-11"));
  expect(response.status).toBe(307);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const provider = new URL(response.headers.get("location")!);
  expect(provider.origin).toContain("supabase.co");
  expect(provider.pathname).toBe("/auth/v1/authorize");
  expect(provider.searchParams.get("provider")).toBe("google");
  expect(provider.searchParams.get("flow_type")).toBe("pkce");
  expect(provider.searchParams.get("code_challenge_method")).toBe("s256");
  const cookieHeaders = response.headers.getSetCookie();
  expect(cookieHeaders.filter((c) => c.includes("financial_app_google_")).length).toBe(3);
  for (const header of cookieHeaders) {
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=lax");
    expect(header).toContain("Max-Age=300");
  }
  const verifier = response.cookies.get("financial_app_google_pkce")!.value;
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  expect(provider.searchParams.get("code_challenge")).toBe(challenge);
  const redirect = new URL(provider.searchParams.get("redirect_to")!);
  expect(redirect.origin).toBe("https://financialapp.test");
  expect(redirect.pathname).toBe("/api/auth/google/callback");
  expect(redirect.searchParams.get("state")).toBe(response.cookies.get("financial_app_google_state")!.value);
  expect(response.cookies.get("financial_app_google_next")!.value).toBe("/transactions?month=2026-11");
});

test("Google start rejects an external next URL", async () => {
  const started = await begin(new NextRequest("https://financialapp.test/api/auth/google?next=%2F%2Fevil.example%2F"));
  expect(started.cookies.get("financial_app_google_next")?.value).toBe("/");
});

test("Google callback fails closed on missing or mismatched state without token exchange", async () => {
  const started = await begin(new NextRequest("https://financialapp.test/api/auth/google"));
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("must not contact provider"); };
  const valid = requestToCallback(started);
  valid.nextUrl.searchParams.set("state", "wrong");
  const response = await callback(valid);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toContain("/login?google_error=invalid");
  expect(response.headers.getSetCookie().join(";")).toContain("Max-Age=0");
  expect(calls).toBe(0);
  expect((await callback(new NextRequest("https://financialapp.test/api/auth/google/callback?code=x"))).status).toBe(303);
});

test("Google callback only issues Financial App cookies after allowlist approves user", async () => {
  const started = await begin(new NextRequest("https://financialapp.test/api/auth/google?next=%2Fanalysis"));
  const calls: string[] = [];
  global.fetch = async (url, init) => {
    const name = String(url);
    calls.push(name);
    if (name.includes("/auth/v1/token?grant_type=pkce")) {
      expect(init?.redirect).toBe("error");
      expect(JSON.parse(String(init?.body))).toEqual({
        auth_code: "synthetic-code",
        code_verifier: started.cookies.get("financial_app_google_pkce")!.value,
      });
      return Response.json({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600 });
    }
    if (name.includes("/rest/v1/rpc/financial_app_is_authorized")) return Response.json(true);
    throw new Error("unexpected call");
  };
  const response = await callback(requestToCallback(started));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://financialapp.test/analysis");
  expect(calls).toHaveLength(2);
  expect(response.cookies.get(AUTH_ACCESS_COOKIE)?.value).toBe("synthetic-access");
  expect(response.cookies.get(AUTH_REFRESH_COOKIE)?.value).toBe("synthetic-refresh");
  expect(response.cookies.get("financial_app_google_pkce")?.value).toBe("");
});

test("Google identity not on existing user ID allowlist is denied and revoked", async () => {
  const started = await begin(new NextRequest("https://financialapp.test/api/auth/google"));
  const calls: string[] = [];
  global.fetch = async (url) => {
    const path = String(url);
    calls.push(path);
    if (path.includes("/auth/v1/token?grant_type=pkce")) {
      return Response.json({ access_token: "unapproved-access", refresh_token: "unapproved-refresh", expires_in: 3600 });
    }
    if (path.includes("/rest/v1/rpc/financial_app_is_authorized")) return Response.json(false);
    if (path.includes("/auth/v1/logout")) return new Response(null, { status: 204 });
    throw new Error("unexpected call");
  };
  const response = await callback(requestToCallback(started));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toContain("google_error=denied");
  expect(calls).toHaveLength(3);
  expect(response.cookies.get(AUTH_ACCESS_COOKIE)).toBeUndefined();
  expect(response.cookies.get(AUTH_REFRESH_COOKIE)).toBeUndefined();
});

test("provider errors and malformed callback never issue a session", async () => {
  const started = await begin(new NextRequest("https://financialapp.test/api/auth/google"));
  const request = requestToCallback(started);
  request.nextUrl.searchParams.set("error", "access_denied");
  const response = await callback(request);
  expect(response.headers.get("location")).toContain("google_error=denied");
  expect(response.cookies.get(AUTH_ACCESS_COOKIE)).toBeUndefined();
});

test("REC-REL-686 · Google is visible by default and password access expands on demand", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Acceso privado" })).toBeVisible();
  const googleLogin = page.getByRole("link", { name: "Continuar con Google" });
  await expect(googleLogin).toBeVisible();
  await expect(googleLogin).toHaveAttribute("href", "/api/auth/google?next=%2F");
  const alternative = page.getByText("Acceso alternativo con contraseña", { exact: true });
  await expect(alternative).toBeVisible();

  // Closed details must keep the password controls out of the default UI.
  await expect(page.getByRole("button", { name: "Entrar" })).toBeHidden();
  await alternative.click();
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});
