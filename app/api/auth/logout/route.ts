import { NextRequest, NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE } from "../../../../src/infrastructure/auth/access-control";
import { clearSessionCookies, revokeAuthSession } from "../../../../src/infrastructure/auth/supabase-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(AUTH_ACCESS_COOKIE)?.value ?? "";
  if (accessToken) await revokeAuthSession(accessToken);

  const response = NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
  clearSessionCookies(response);
  return response;
}
