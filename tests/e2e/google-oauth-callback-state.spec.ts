import { expect, test } from "@playwright/test";
import { GET } from "../../app/api/source/google/callback/route";
import { GOOGLE_OAUTH_STATE_COOKIE } from "../../src/infrastructure/google/google-source-runtime";

const REQUIRED_GOOGLE_ENV = {
  GOOGLE_OAUTH_CLIENT_ID: "client-test.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "secret-test",
  GOOGLE_OAUTH_REDIRECT_URI: "https://preview.example.test/api/source/google/callback",
  GOOGLE_BANK_SOURCE_SPREADSHEET_ID: "official-source-test",
  GOOGLE_OAUTH_ALLOWED_EMAIL: "alberto@example.test",
};

test.beforeEach(() => {
  Object.assign(process.env, REQUIRED_GOOGLE_ENV);
});

test("el callback distingue una sesión OAuth caducada y limpia la cookie de estado", async () => {
  const response = await GET(
    new Request("https://preview.example.test/api/source/google/callback?state=0123456789abcdef"),
  );

  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location") ?? "https://invalid.example.test");
  expect(location.pathname).toBe("/configuration/source");
  expect(location.searchParams.get("google")).toBe("error");
  expect(location.searchParams.get("code")).toBe("google_oauth_state_missing");
  expect(response.headers.get("set-cookie")).toContain(`${GOOGLE_OAUTH_STATE_COOKIE}=`);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
});

test("el callback distingue un state OAuth manipulado de una sesión caducada", async () => {
  const expectedState = "0123456789abcdef0123456789abcdef";
  const receivedState = "1123456789abcdef0123456789abcdef";
  const response = await GET(
    new Request(`https://preview.example.test/api/source/google/callback?state=${receivedState}`, {
      headers: { cookie: `${GOOGLE_OAUTH_STATE_COOKIE}=${expectedState}` },
    }),
  );

  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location") ?? "https://invalid.example.test");
  expect(location.pathname).toBe("/configuration/source");
  expect(location.searchParams.get("google")).toBe("error");
  expect(location.searchParams.get("code")).toBe("invalid_google_oauth_state");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
});
