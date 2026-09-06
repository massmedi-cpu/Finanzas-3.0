import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "../../../../src/infrastructure/auth/access-control";
import { setSessionCookies, signInWithPassword } from "../../../../src/infrastructure/auth/supabase-auth";

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

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
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
  if (result.status !== "ok") {
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

  const response = NextResponse.json(
    { ok: true, next },
    { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
  setSessionCookies(response, result.session);
  return response;
}
