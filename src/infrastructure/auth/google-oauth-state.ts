import type { NextResponse } from "next/server";

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
