export const AUTH_ACCESS_COOKIE = "financial_app_access";
export const AUTH_REFRESH_COOKIE = "financial_app_refresh";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/build",
  "/api/auth/login",
  "/api/auth/logout",
]);

export function shouldEnforceAppAuth(env: NodeJS.ProcessEnv = process.env) {
  return env.VERCEL_ENV === "production" || env.FINANCIAL_APP_AUTH_ENFORCED === "true";
}

export function isPublicAuthPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname);
}

export function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function safeNextPath(value: unknown) {
  if (typeof value !== "string") return "/";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  if (trimmed === "/login" || trimmed.startsWith("/login?")) return "/";
  return trimmed.length <= 512 ? trimmed : "/";
}
