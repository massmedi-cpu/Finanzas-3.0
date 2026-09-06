import type { NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE } from "./access-control";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://btzukbfesxdratqnxuoj.supabase.co").replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_1lp5YHmItK1HHayW8mcchg_xwuUrgo2";
const AUTH_TIMEOUT_MS = 5_000;
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type TokenValidationResult = "valid" | "invalid" | "unavailable";
export type SessionResult =
  | { status: "ok"; session: AuthSession }
  | { status: "invalid" }
  | { status: "rate_limited" }
  | { status: "unavailable" };

function authHeaders(accessToken?: string) {
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "content-type": "application/json",
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return headers;
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.access_token === "string"
    && row.access_token.length > 0
    && typeof row.refresh_token === "string"
    && row.refresh_token.length > 0
    && typeof row.expires_in === "number"
    && Number.isFinite(row.expires_in)
    && row.expires_in > 0;
}

async function authFetch(path: string, init: RequestInit) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });
}

export async function validateAccessToken(accessToken: string): Promise<TokenValidationResult> {
  try {
    const response = await authFetch("/auth/v1/user", {
      method: "GET",
      headers: authHeaders(accessToken),
    });
    if (response.ok) return "valid";
    if (response.status === 401 || response.status === 403) return "invalid";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function signInWithPassword(email: string, password: string): Promise<SessionResult> {
  try {
    const response = await authFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    if (response.status === 429) return { status: "rate_limited" };
    if (response.status === 400 || response.status === 401 || response.status === 422) {
      return { status: "invalid" };
    }
    if (!response.ok) return { status: "unavailable" };
    const payload: unknown = await response.json().catch(() => null);
    if (!isAuthSession(payload)) return { status: "unavailable" };
    return { status: "ok", session: payload };
  } catch {
    return { status: "unavailable" };
  }
}

export async function refreshAuthSession(refreshToken: string): Promise<SessionResult> {
  try {
    const response = await authFetch("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (response.status === 429) return { status: "rate_limited" };
    if (response.status === 400 || response.status === 401 || response.status === 422) {
      return { status: "invalid" };
    }
    if (!response.ok) return { status: "unavailable" };
    const payload: unknown = await response.json().catch(() => null);
    if (!isAuthSession(payload)) return { status: "unavailable" };
    return { status: "ok", session: payload };
  } catch {
    return { status: "unavailable" };
  }
}

export async function revokeAuthSession(accessToken: string) {
  try {
    await authFetch("/auth/v1/logout", {
      method: "POST",
      headers: authHeaders(accessToken),
    });
  } catch {
    // Best effort only. Local cookies are cleared regardless.
  }
}

export function setSessionCookies(response: NextResponse, session: AuthSession) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(AUTH_ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, Math.floor(session.expires_in)),
  });
  response.cookies.set(AUTH_REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

export function clearSessionCookies(response: NextResponse) {
  const secure = process.env.NODE_ENV === "production";
  for (const name of [AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}
