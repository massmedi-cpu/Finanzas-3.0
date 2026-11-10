import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "../../../../src/infrastructure/auth/access-control";
import { SUPABASE_URL } from "../../../../src/infrastructure/auth/supabase-auth";

export const dynamic = "force-dynamic";
export const GOOGLE_OAUTH_VERIFIER_COOKIE = "financial_app_google_pkce";
export const GOOGLE_OAUTH_STATE_COOKIE = "financial_app_google_state";
export const GOOGLE_OAUTH_NEXT_COOKIE = "financial_app_google_next";
export const GOOGLE_OAUTH_COOKIE_PATH = "/api/auth/google";
export const GOOGLE_OAUTH_MAX_AGE = 300;

export function expireGoogleOAuthCookies(response: NextResponse) {
  for (const name of [
    GOOGLE_OAUTH_VERIFIER_COOKIE,
    GOOGLE_OAUTH_STATE_COOKIE,
    GOOGLE_OAUTH_NEXT_COOKIE,
  ]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: GOOGLE_OAUTH_COOKIE_PATH,
      maxAge: 0,
    });
  }
}

export async function GET(request: NextRequest) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const callback = new URL("/api/auth/google/callback", request.nextUrl.origin);
  callback.searchParams.set("state", state);

  const provider = new URL(SUPABASE_URL + "/auth/v1/authorize");
  provider.searchParams.set("provider", "google");
  provider.searchParams.set("flow_type", "pkce");
  provider.searchParams.set("code_challenge", challenge);
  provider.searchParams.set("code_challenge_method", "s256");
  provider.searchParams.set("redirect_to", callback.toString());

  const response = NextResponse.redirect(provider, {
    status: 307,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
  const secure = process.env.NODE_ENV === "production";
  for (const [name, value] of [
    [GOOGLE_OAUTH_VERIFIER_COOKIE, verifier],
    [GOOGLE_OAUTH_STATE_COOKIE, state],
    [GOOGLE_OAUTH_NEXT_COOKIE, next],
  ]) {
    response.cookies.set(name, value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: GOOGLE_OAUTH_COOKIE_PATH,
      maxAge: GOOGLE_OAUTH_MAX_AGE,
    });
  }
  return response;
}
