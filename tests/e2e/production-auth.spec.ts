import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  safeNextPath,
} from "../../src/infrastructure/auth/access-control";

const ORIGINAL_ENFORCED = process.env.FINANCIAL_APP_AUTH_ENFORCED;
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;
const ORIGINAL_FETCH = global.fetch;

function restoreEnv() {
  if (ORIGINAL_ENFORCED === undefined) delete process.env.FINANCIAL_APP_AUTH_ENFORCED;
  else process.env.FINANCIAL_APP_AUTH_ENFORCED = ORIGINAL_ENFORCED;

  if (ORIGINAL_VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;

  global.fetch = ORIGINAL_FETCH;
}

test.afterEach(() => restoreEnv());

test("production auth rejects anonymous API requests without contacting persistence", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";

  const response = await proxy(new NextRequest("https://financialapp.test/api/configuration"));
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "authentication_required", code: null });
});

test("production auth redirects anonymous pages to login and preserves a local next path", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";

  const response = await proxy(new NextRequest("https://financialapp.test/transactions?review=pending"));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    "https://financialapp.test/login?next=%2Ftransactions%3Freview%3Dpending",
  );
});

test("build metadata remains public so the deployed SHA can be verified", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";

  const response = await proxy(new NextRequest("https://financialapp.test/api/build"));
  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
});

test("the application auth layer does not replace existing Preview protection", async () => {
  delete process.env.FINANCIAL_APP_AUTH_ENFORCED;
  process.env.VERCEL_ENV = "preview";

  const response = await proxy(new NextRequest("https://financialapp.test/api/configuration"));
  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
});

test("a valid Supabase token is still denied when the user is not allowlisted", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";
  global.fetch = async () => Response.json(false);

  const response = await proxy(new NextRequest("https://financialapp.test/api/configuration", {
    headers: { cookie: `${AUTH_ACCESS_COOKIE}=valid-but-not-authorized` },
  }));
  expect(response.status).toBe(401);
});

test("an allowlisted authenticated user can reach protected routes", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";
  global.fetch = async (input) => {
    expect(String(input)).toContain("/rest/v1/rpc/financial_app_is_authorized");
    return Response.json(true);
  };

  const response = await proxy(new NextRequest("https://financialapp.test/api/configuration", {
    headers: { cookie: `${AUTH_ACCESS_COOKIE}=authorized-token` },
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
});

test("refreshing a session cannot bypass a revoked allowlist authorization", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/token?grant_type=refresh_token")) {
      return Response.json({
        access_token: "refreshed-access",
        refresh_token: "rotated-refresh",
        expires_in: 3600,
      });
    }
    if (url.includes("/rest/v1/rpc/financial_app_is_authorized")) {
      return Response.json(false);
    }
    if (url.includes("/auth/v1/logout")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected_auth_request:${url}`);
  };

  const response = await proxy(new NextRequest("https://financialapp.test/api/configuration", {
    headers: { cookie: `${AUTH_REFRESH_COOKIE}=existing-refresh` },
  }));
  expect(response.status).toBe(401);
  const cookies = response.headers.getSetCookie().join(";");
  expect(cookies).toContain(`${AUTH_ACCESS_COOKIE}=`);
  expect(cookies).toContain(`${AUTH_REFRESH_COOKIE}=`);
  expect(cookies).toContain("Max-Age=0");
});

test("an allowlisted refreshed session can continue and rotates both cookies", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/token?grant_type=refresh_token")) {
      return Response.json({
        access_token: "refreshed-access",
        refresh_token: "rotated-refresh",
        expires_in: 3600,
      });
    }
    if (url.includes("/rest/v1/rpc/financial_app_is_authorized")) {
      return Response.json(true);
    }
    throw new Error(`unexpected_auth_request:${url}`);
  };

  const response = await proxy(new NextRequest("https://financialapp.test/api/configuration", {
    headers: { cookie: `${AUTH_REFRESH_COOKIE}=existing-refresh` },
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
  const cookies = response.headers.getSetCookie().join(";");
  expect(cookies).toContain(`${AUTH_ACCESS_COOKIE}=refreshed-access`);
  expect(cookies).toContain(`${AUTH_REFRESH_COOKIE}=rotated-refresh`);
});

test("post-login redirects reject protocol-relative and backslash variants", () => {
  expect(safeNextPath("//example.com/private")).toBe("/");
  expect(safeNextPath("/\\example.com/private")).toBe("/");
  expect(safeNextPath("/transactions?review=pending")).toBe("/transactions?review=pending");
});
