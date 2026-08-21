import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) return NextResponse.redirect(new URL("/login?error=oauth", requestUrl.origin));

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return NextResponse.redirect(new URL("/login?error=oauth", requestUrl.origin));

  const { data, error: userError } = await supabase.auth.getUser();
  const email = normalizeEmail(data.user?.email);
  if (userError || !data.user || !(await hasFinancialAppAccess(supabase, email))) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(new URL("/login?error=unauthorized", requestUrl.origin));
  }

  const response = NextResponse.redirect(new URL(safeNext, requestUrl.origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
