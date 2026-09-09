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

test("Vercel Production enables the auth gate without an extra feature flag", async () => {
  delete process.env.FINANCIAL_APP_AUTH_ENFORCED;
  process.env.VERCEL_ENV = "production";

  const response = await proxy(new NextRequest("https://financialapp.test/api/configuration"));
  expect(response.status).toBe(401);
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

test("PRE-005 rejects a cross-site authenticated mutation before auth or persistence work", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";
  let authCalls = 0;
  global.fetch = async () => {
    authCalls += 1;
    return Response.json(true);
  };

  const response = await proxy(new NextRequest("https://financialapp.test/api/forecast", {
    method: "POST",
    headers: {
      cookie: `${AUTH_ACCESS_COOKIE}=authorized-token`,
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    },
  }));

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "cross_site_mutation_rejected", code: null });
  expect(authCalls).toBe(0);
});

test("PRE-005 preserves authenticated same-origin mutations", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";
  global.fetch = async () => Response.json(true);

  const response = await proxy(new NextRequest("https://financialapp.test/api/forecast", {
    method: "POST",
    headers: {
      cookie: `${AUTH_ACCESS_COOKIE}=authorized-token`,
      origin: "https://financialapp.test",
      "sec-fetch-site": "same-origin",
    },
  }));

  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
});

test("PRE-005 also protects public auth mutations such as login from cross-site requests", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";

  const response = await proxy(new NextRequest("https://financialapp.test/api/auth/login", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    },
  }));

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "cross_site_mutation_rejected", code: null });
});

test("PRE-005 does not block GET callbacks or server-to-server requests without browser origin headers", async () => {
  delete process.env.FINANCIAL_APP_AUTH_ENFORCED;
  process.env.VERCEL_ENV = "preview";

  const callback = await proxy(new NextRequest("https://financialapp.test/api/source/google/callback?code=x&state=y", {
    method: "GET",
    headers: { "sec-fetch-site": "cross-site" },
  }));
  expect(callback.status).toBe(200);
  expect(callback.headers.get("x-middleware-next")).toBe("1");

  const serverMutation = await proxy(new NextRequest("https://financialapp.test/api/forecast", {
    method: "POST",
  }));
  expect(serverMutation.status).toBe(200);
  expect(serverMutation.headers.get("x-middleware-next")).toBe("1");
});
