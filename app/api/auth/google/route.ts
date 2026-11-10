import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "../../../../src/infrastructure/auth/access-control";
import { SUPABASE_URL } from "../../../../src/infrastructure/auth/supabase-auth";
import {
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_NEXT_COOKIE,
  GOOGLE_OAUTH_COOKIE_PATH,
  GOOGLE_OAUTH_MAX_AGE,
} from "../../../../src/infrastructure/auth/google-oauth-state";

export const dynamic = "force-dynamic";
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
