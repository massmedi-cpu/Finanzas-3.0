import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

function backToLogin(request: NextRequest) {
  return NextResponse.redirect(new URL("/login?error=preview", request.url));
}

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return new NextResponse(null, { status: 404 });

  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (token.length < 32 || token.length > 160) return backToLogin(request);

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = (forwardedHost || request.headers.get("host") || request.nextUrl.host).toLowerCase();

  try {
    const exchange = await fetch(`${SUPABASE_URL}/functions/v1/financial-app-preview-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, host }),
      cache: "no-store",
    });
    const payload = await exchange.json().catch(() => null) as { access_token?: string; refresh_token?: string } | null;
    if (!exchange.ok || !payload?.access_token || !payload?.refresh_token) return backToLogin(request);

    const supabase = await createClient();
    const { data, error } = await supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    });
    const email = normalizeEmail(data.user?.email);
    if (error || !data.user || !(await hasFinancialAppAccess(supabase, email))) {
      await supabase.auth.signOut({ scope: "local" });
      return backToLogin(request);
    }

    const response = NextResponse.redirect(new URL("/", request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return backToLogin(request);
  }
}
