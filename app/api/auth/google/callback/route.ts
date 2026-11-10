import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "../../../../../src/infrastructure/auth/access-control";
import {
  exchangeGoogleOAuthCode,
  revokeAuthSession,
  setSessionCookies,
  validateAccessToken,
} from "../../../../../src/infrastructure/auth/supabase-auth";
import {
  expireGoogleOAuthCookies,
  GOOGLE_OAUTH_NEXT_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
} from "../../../../../src/infrastructure/auth/google-oauth-state";

export const dynamic = "force-dynamic";

function redirect(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin), {
    status: 303,
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
    },
  });
}

function failed(request: NextRequest, reason: "denied" | "unavailable" | "invalid") {
  const response = redirect(request, "/login?google_error=" + reason);
  expireGoogleOAuthCookies(response);
  return response;
}

function sameState(incoming: string, expected: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(incoming) || !/^[A-Za-z0-9_-]{43}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(incoming, "ascii"), Buffer.from(expected, "ascii"));
}

export async function GET(request: NextRequest) {
  const verifier = request.cookies.get(GOOGLE_OAUTH_VERIFIER_COOKIE)?.value ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value ?? "";
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const next = safeNextPath(request.cookies.get(GOOGLE_OAUTH_NEXT_COOKIE)?.value);

  // No exchange without the same-browser verifier and state. Never accept a
  // callback from another OAuth attempt or another browser.
  if (!sameState(state, expectedState) || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
    return failed(request, "invalid");
  }
  if (request.nextUrl.searchParams.has("error")) return failed(request, "denied");
  if (!code || code.length > 2048) return failed(request, "invalid");

  const token = await exchangeGoogleOAuthCode(code, verifier);
  if (token.status !== "ok") {
    return failed(request, token.status === "unavailable" || token.status === "rate_limited"
      ? "unavailable"
      : "invalid");
  }

  // The Google identity alone is not sufficient: the existing user-ID-based
  // financial_app.authorized_users allowlist is mandatory.
  const authorized = await validateAccessToken(token.session.access_token);
  if (authorized !== "valid") {
    await revokeAuthSession(token.session.access_token);
    return failed(request, authorized === "unavailable" ? "unavailable" : "denied");
  }

  const response = redirect(request, next);
  setSessionCookies(response, token.session);
  expireGoogleOAuthCookies(response);
  return response;
}
