import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { POST as login } from "../../app/api/auth/login/route";

const ORIGINAL_FETCH = global.fetch;
test.afterEach(() => { global.fetch = ORIGINAL_FETCH; });

const endpoint = "https://financialapp.test/api/auth/login";
function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

test("REC-AUTH-229 · oversized public login is rejected before Supabase Auth", async () => {
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error("unexpected_auth_request");
  };
  const response = await login(request(JSON.stringify({
    email: "test@example.invalid", password: "x", extra: "A".repeat(9 * 1024),
  })));
  expect(response.status).toBe(413);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "invalid_request", code: "login_body_too_large" });
  expect(networkCalls).toBe(0);
});

test("REC-AUTH-230 · Content-Length is untrusted; reject declared oversize without Auth", async () => {
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error("unexpected_auth_request");
  };
  const response = await login(request('{"email":"test@example.invalid","password":"x"}', {
    "content-length": String(64 * 1024),
  }));
  expect(response.status).toBe(413);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(networkCalls).toBe(0);
});

test("REC-AUTH-231 · malformed JSON keeps generic auth denial and no network call", async () => {
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error("unexpected_auth_request");
  };
  const response = await login(request("{not-json"));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "invalid_credentials", code: null });
  expect(networkCalls).toBe(0);
});

test("REC-AUTH-232 · ordinary valid-shape login still asks Supabase Auth", async () => {
  const calls: string[] = [];
  global.fetch = async (input) => {
    calls.push(String(input));
    return Response.json({ msg: "Invalid login credentials" }, { status: 400 });
  };
  const response = await login(request(JSON.stringify({
    email: "test@example.invalid", password: "synthetic-password",
  })));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "invalid_credentials", code: null });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain("/auth/v1/token?grant_type=password");
});
