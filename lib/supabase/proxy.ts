import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasFinancialAppAccess, normalizeEmail } from "@/lib/auth/access";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const pathname = request.nextUrl.pathname;
  const publicPath = pathname === "/login" || pathname.startsWith("/auth/");

  if (!url || !key) {
    if (publicPath) return response;
    return NextResponse.redirect(new URL("/login?error=configuration", request.url));
  }

  const supabase = createServerClient(url, key, {
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
