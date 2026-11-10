import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { POST as login } from "../../app/api/auth/login/route";
import {
  refreshAuthSession,
  signInWithPassword,
  validateAccessToken,
} from "../../src/infrastructure/auth/supabase-auth";

const ORIGINAL_FETCH = global.fetch;
const SYNTHETIC_SESSION = {
  access_token: "synthetic-access-token",
  refresh_token: "synthetic-refresh-token",
  expires_in: 3600,
};

test.afterEach(() => { global.fetch = ORIGINAL_FETCH; });

const sessionOperations = [
  { name: "password login", run: () => signInWithPassword("owner@example.invalid", "synthetic-password") },
  { name: "session refresh", run: () => refreshAuthSession("synthetic-refresh-token") },
];

for (const operation of sessionOperations) {
  for (const status of [307, 308]) {
    test(`REC-AUTH-627 · ${operation.name} never forwards credentials through HTTP ${status}`, async () => {
      let redirectedRequests = 0;
      const server = createServer((request, response) => {
        request.resume();
        if (request.url === "/redirected") {
          redirectedRequests += 1;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify(SYNTHETIC_SESSION));
        } else {
          response.writeHead(status, { location: "/redirected" });
          response.end();
        }
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address() as AddressInfo;
      global.fetch = (_input, init) => ORIGINAL_FETCH(`http://127.0.0.1:${port}/auth`, init);

      try {
        const result = await operation.run();
        expect(redirectedRequests).toBe(0);
        expect(result).toEqual({ status: "unavailable" });
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    });
  }

  test(`REC-AUTH-628 · ${operation.name} rejects an oversized response with understated Content-Length`, async () => {
    let cancelled = false;
    const bytes = new TextEncoder().encode(JSON.stringify({ ...SYNTHETIC_SESSION, user: { metadata: "x".repeat(128 * 1024) } }));
    let offset = 0;
    global.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.byteLength) return controller.close();
        const end = Math.min(offset + 16 * 1024, bytes.byteLength);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
      },
      cancel() { cancelled = true; },
    }), { headers: { "content-type": "application/json", "content-length": "1" } });

    expect(await operation.run()).toEqual({ status: "unavailable" });
    expect(cancelled).toBe(true);
  });
}

test("REC-AUTH-628 · oversized allowlist JSON cannot authorize a private request", async () => {
  global.fetch = async () => new Response(" ".repeat(70 * 1024) + "true");
  expect(await validateAccessToken("synthetic-access-token")).toBe("unavailable");
});

test("REC-AUTH-628 · ordinary login returns only its receipt and keeps tokens in HttpOnly cookies", async () => {
  let calls = 0;
  global.fetch = async (input) => {
    calls += 1;
    return String(input).includes("/auth/v1/token")
      ? Response.json(SYNTHETIC_SESSION)
      : Response.json(true);
  };
  const response = await login(new NextRequest("https://financialapp.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@example.invalid", password: "synthetic-password", next: "/transactions" }),
  }));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, next: "/transactions" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  const cookies = response.headers.getSetCookie();
  expect(cookies).toHaveLength(2);
  for (const cookie of cookies) {
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
  }
  expect(calls).toBe(2);
});
