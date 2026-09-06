import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  isApiPath,
  isPublicAuthPath,
  safeNextPath,
  shouldEnforceAppAuth,
} from "./src/infrastructure/auth/access-control";
import {
  clearSessionCookies,
  refreshAuthSession,
  setSessionCookies,
  validateAccessToken,
} from "./src/infrastructure/auth/supabase-auth";

function unauthorizedResponse(request: NextRequest) {
  if (isApiPath(request.nextUrl.pathname)) {
    return NextResponse.json(
      { error: "authentication_required", code: null },
      {
        status: 401,
        headers: {
          "cache-control": "no-store",
          "x-robots-tag": "noindex",
        },
      },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  const next = safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

function unavailableResponse(request: NextRequest) {
  if (isApiPath(request.nextUrl.pathname)) {
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

  return new NextResponse("El acceso seguro no está disponible temporalmente.", {
    status: 503,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
      "retry-after": "30",
      "x-robots-tag": "noindex",
    },
  });
}

export async function proxy(request: NextRequest) {
  if (!shouldEnforceAppAuth() || isPublicAuthPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(AUTH_ACCESS_COOKIE)?.value ?? "";
  const refreshToken = request.cookies.get(AUTH_REFRESH_COOKIE)?.value ?? "";

  if (accessToken) {
    const validation = await validateAccessToken(accessToken);
    if (validation === "valid") return NextResponse.next();
    if (validation === "unavailable") return unavailableResponse(request);
  }

  if (refreshToken) {
    const refreshed = await refreshAuthSession(refreshToken);
    if (refreshed.status === "ok") {
      const response = NextResponse.next();
      setSessionCookies(response, refreshed.session);
      return response;
    }
    if (refreshed.status === "unavailable" || refreshed.status === "rate_limited") {
      return unavailableResponse(request);
    }
  }

  const response = unauthorizedResponse(request);
  clearSessionCookies(response);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
