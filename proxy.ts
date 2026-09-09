import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  isApiPath,
  isPublicAuthPath,
  safeNextPath,
  shouldEnforceAppAuth,
} from "./src/infrastructure/auth/access-control";
import { shouldRejectCrossSiteMutation } from "./src/infrastructure/auth/mutation-origin";
import {
  clearSessionCookies,
  refreshAuthSession,
  revokeAuthSession,
  setSessionCookies,
  SUPABASE_URL,
  validateAccessToken,
} from "./src/infrastructure/auth/supabase-auth";

type ContentSecurityPolicyContext = {
  value: string;
  requestHeaders: Headers;
};

function configuredSupabaseOrigin() {
  try {
    const url = new URL(SUPABASE_URL);
    if (url.protocol !== "https:" && process.env.NODE_ENV !== "development") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function createContentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  const styleSources = ["'self'", `'nonce-${nonce}'`];
  const connectSources = ["'self'"];
  const supabaseOrigin = configuredSupabaseOrigin();

  if (supabaseOrigin) connectSources.push(supabaseOrigin);

  if (isDev) {
    scriptSources.push("'unsafe-eval'");
    styleSources.push("'unsafe-inline'");
    connectSources.push("https://storage.mock");
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    `style-src ${styleSources.join(" ")}`,
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function contentSecurityPolicyContext(request: NextRequest): ContentSecurityPolicyContext | null {
  if (isApiPath(request.nextUrl.pathname)) return null;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const value = createContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", value);
  return { value, requestHeaders };
}

function applyContentSecurityPolicy<T extends NextResponse>(
  response: T,
  context: ContentSecurityPolicyContext | null,
) {
  if (context) response.headers.set("Content-Security-Policy", context.value);
  return response;
}

function nextResponse(context: ContentSecurityPolicyContext | null) {
  if (!context) return NextResponse.next();
  const response = NextResponse.next({ request: { headers: context.requestHeaders } });
  return applyContentSecurityPolicy(response, context);
}

function unauthorizedResponse(request: NextRequest, context: ContentSecurityPolicyContext | null) {
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
  return applyContentSecurityPolicy(NextResponse.redirect(loginUrl), context);
}

function unavailableResponse(request: NextRequest, context: ContentSecurityPolicyContext | null) {
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

  return applyContentSecurityPolicy(
    new NextResponse("El acceso seguro no está disponible temporalmente.", {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        "retry-after": "30",
        "x-robots-tag": "noindex",
      },
    }),
    context,
  );
}

function crossSiteMutationResponse() {
  return NextResponse.json(
    { error: "cross_site_mutation_rejected", code: null },
    {
      status: 403,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex",
      },
    },
  );
}

export async function proxy(request: NextRequest) {
  const csp = contentSecurityPolicyContext(request);

  if (
    isApiPath(request.nextUrl.pathname) &&
    shouldRejectCrossSiteMutation({
      method: request.method,
      requestUrl: request.url,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    })
  ) {
    return crossSiteMutationResponse();
  }

  if (!shouldEnforceAppAuth() || isPublicAuthPath(request.nextUrl.pathname)) {
    return nextResponse(csp);
  }

  const accessToken = request.cookies.get(AUTH_ACCESS_COOKIE)?.value ?? "";
  const refreshToken = request.cookies.get(AUTH_REFRESH_COOKIE)?.value ?? "";

  if (accessToken) {
    const validation = await validateAccessToken(accessToken);
    if (validation === "valid") return nextResponse(csp);
    if (validation === "unavailable") return unavailableResponse(request, csp);
  }

  if (refreshToken) {
    const refreshed = await refreshAuthSession(refreshToken);
    if (refreshed.status === "ok") {
      const authorization = await validateAccessToken(refreshed.session.access_token);
      if (authorization === "valid") {
        const response = nextResponse(csp);
        setSessionCookies(response, refreshed.session);
        return response;
      }
      if (authorization === "unavailable") return unavailableResponse(request, csp);

      await revokeAuthSession(refreshed.session.access_token);
      const response = unauthorizedResponse(request, csp);
      clearSessionCookies(response);
      return response;
    }
    if (refreshed.status === "unavailable" || refreshed.status === "rate_limited") {
      return unavailableResponse(request, csp);
    }
  }

  const response = unauthorizedResponse(request, csp);
  clearSessionCookies(response);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
