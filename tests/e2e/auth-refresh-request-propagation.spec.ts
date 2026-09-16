import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
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

function mockSuccessfulRefresh() {
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
}

function expectRefreshedDownstreamCookies(response: Response) {
  const overrideHeaders = response.headers.get("x-middleware-override-headers") ?? "";
  const downstreamCookie = response.headers.get("x-middleware-request-cookie") ?? "";
  expect(overrideHeaders.split(",").map((value) => value.trim())).toContain("cookie");
  expect(downstreamCookie).toContain(`${AUTH_ACCESS_COOKIE}=refreshed-access`);
  expect(downstreamCookie).toContain(`${AUTH_REFRESH_COOKIE}=rotated-refresh`);

  const browserCookies = response.headers.getSetCookie().join(";");
  expect(browserCookies).toContain(`${AUTH_ACCESS_COOKIE}=refreshed-access`);
  expect(browserCookies).toContain(`${AUTH_REFRESH_COOKIE}=rotated-refresh`);
}

test("refreshed page session reaches Server Components in the same request and preserves CSP", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";
  mockSuccessfulRefresh();

  const response = await proxy(new NextRequest("https://financialapp.test/analysis", {
    headers: { cookie: `${AUTH_REFRESH_COOKIE}=existing-refresh` },
  }));

  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  expect(response.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
  expect(response.headers.get("x-middleware-request-content-security-policy")).toContain("default-src 'self'");
  expectRefreshedDownstreamCookies(response);
});

test("refreshed API session reaches the Route Handler in the same request", async () => {
  process.env.FINANCIAL_APP_AUTH_ENFORCED = "true";
  process.env.VERCEL_ENV = "preview";
  mockSuccessfulRefresh();

  const response = await proxy(new NextRequest("https://financialapp.test/api/configuration", {
    headers: { cookie: `${AUTH_REFRESH_COOKIE}=existing-refresh` },
  }));

  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expectRefreshedDownstreamCookies(response);
});
