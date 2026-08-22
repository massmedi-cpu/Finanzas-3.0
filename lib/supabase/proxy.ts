import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const publicPath = pathname === "/login" || pathname.startsWith("/auth/");

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const email = normalizeEmail(typeof data?.claims?.email === "string" ? data.claims.email : null);
  const authenticated = !error && Boolean(data?.claims?.sub);
  const allowed = authenticated && (await hasFinancialAppAccess(supabase, email));

  if (!publicPath && !allowed) {
    if (authenticated) await supabase.auth.signOut({ scope: "local" });
    const target = authenticated ? "/login?error=unauthorized" : "/login";
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (pathname === "/login" && allowed) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
