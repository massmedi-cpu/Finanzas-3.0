import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "../../../../src/infrastructure/auth/access-control";
import { LimitedJsonRequestError, readLimitedJsonRequest } from "../../../../src/infrastructure/http/limited-json-request";
import {
  revokeAuthSession,
  setSessionCookies,
  signInWithPassword,
  validateAccessToken,
} from "../../../../src/infrastructure/auth/supabase-auth";

export const dynamic = "force-dynamic";

function invalidCredentials() {
  return NextResponse.json(
    { error: "invalid_credentials", code: null },
    {
      status: 401,
      headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
    },
  );
}

function unavailable() {
  return NextResponse.json(
    { error: "authentication_unavailable", code: null },
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "retry-after": "30",
        "x-robots-tag": "noindex",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  // The public login endpoint must not buffer unbounded JSON before validating
  // credentials. The same 8 KiB cap applies with or without Content-Length.
  let body: unknown;
  try {
    body = await readLimitedJsonRequest(request, 8 * 1024);
  } catch (error) {
    if (error instanceof LimitedJsonRequestError && error.reason === "too_large") {
      return NextResponse.json(
        { error: "invalid_request", code: "login_body_too_large" },
        { status: 413, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    return invalidCredentials();
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalidCredentials();

  const row = body as Record<string, unknown>;
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  const password = typeof row.password === "string" ? row.password : "";
  const next = safeNextPath(row.next);

  if (!email || email.length > 254 || !email.includes("@") || !password || password.length > 512) {
    return invalidCredentials();
  }

  const result = await signInWithPassword(email, password);
  if (result.status === "invalid") return invalidCredentials();
  if (result.status === "rate_limited") {
    return NextResponse.json(
      { error: "too_many_attempts", code: null },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": "60",
          "x-robots-tag": "noindex",
        },
      },
    );
  }
  if (result.status !== "ok") return unavailable();

  const authorization = await validateAccessToken(result.session.access_token);
  if (authorization === "unavailable") {
    await revokeAuthSession(result.session.access_token);
    return unavailable();
  }
  if (authorization !== "valid") {
    await revokeAuthSession(result.session.access_token);
    return NextResponse.json(
      { error: "access_not_authorized", code: null },
      {
        status: 403,
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      },
    );
  }

  const response = NextResponse.json(
    { ok: true, next },
    { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
  setSessionCookies(response, result.session);
  return response;
}
