export const WEB_VITAL_NAMES = ["CLS", "FCP", "FID", "INP", "LCP", "TTFB"] as const;
export type WebVitalName = (typeof WEB_VITAL_NAMES)[number];

export const WEB_VITAL_RATINGS = ["good", "needs-improvement", "poor"] as const;
export type WebVitalRating = (typeof WEB_VITAL_RATINGS)[number];

export const CLIENT_ERROR_KINDS = ["window_error", "unhandled_rejection"] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export const TELEMETRY_ROUTES = [
  "/",
  "/onboarding",
  "/review",
  "/transactions",
  "/analysis",
  "/accounts",
  "/budgets",
  "/forecast",
  "/recurrences",
  "/documents",
  "/configuration",
  "/configuration/source",
  "/other",
] as const;
export type TelemetryRoute = (typeof TELEMETRY_ROUTES)[number];

/**
 * Production RUM budgets. Timing values are milliseconds; CLS is unitless.
 * These thresholds use the established "good" boundary for the corresponding
 * web-vitals metric. FID remains only for compatibility; INP is the current
 * responsiveness metric used for readiness decisions.
 */
export const WEB_VITAL_BUDGETS: Readonly<Record<WebVitalName, number>> = {
  CLS: 0.1,
  FCP: 1_800,
  FID: 100,
  INP: 200,
  LCP: 2_500,
  TTFB: 800,
};

const WEB_VITAL_SET = new Set<string>(WEB_VITAL_NAMES);
const RATING_SET = new Set<string>(WEB_VITAL_RATINGS);
const CLIENT_ERROR_KIND_SET = new Set<string>(CLIENT_ERROR_KINDS);
const ROUTE_SET = new Set<string>(TELEMETRY_ROUTES);
const WEB_VITAL_FIELDS = new Set(["type", "route", "name", "value", "rating"]);
const CLIENT_ERROR_FIELDS = new Set(["type", "route", "kind", "errorName"]);
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

export type WebVitalTelemetry = {
  type: "web_vital";
  route: TelemetryRoute;
  name: WebVitalName;
  value: number;
  rating: WebVitalRating | null;
};

export type ClientErrorTelemetry = {
  type: "client_error";
  route: TelemetryRoute;
  kind: ClientErrorKind;
  errorName: string;
};

export type OperationalTelemetry = WebVitalTelemetry | ClientErrorTelemetry;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function isWebVitalName(value: unknown): value is WebVitalName {
  return typeof value === "string" && WEB_VITAL_SET.has(value);
}

export function normalizeTelemetryRoute(value: unknown): TelemetryRoute {
  if (typeof value !== "string") return "/other";
  const pathname = value.trim().split(/[?#]/, 1)[0] || "/";
  return ROUTE_SET.has(pathname) ? (pathname as TelemetryRoute) : "/other";
}

export function webVitalWithinBudget(name: WebVitalName, value: number) {
  return value <= WEB_VITAL_BUDGETS[name];
}

export function parseOperationalTelemetry(value: unknown): OperationalTelemetry | null {
  if (!isRecord(value) || typeof value.route !== "string") return null;

  const route = normalizeTelemetryRoute(value.route);

  if (value.type === "web_vital") {
    if (!hasOnlyKeys(value, WEB_VITAL_FIELDS)) return null;
    if (!isWebVitalName(value.name)) return null;
    if (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0 || value.value > 3_600_000) {
      return null;
    }
    if (
      value.rating !== null &&
      (typeof value.rating !== "string" || !RATING_SET.has(value.rating))
    ) {
      return null;
    }
    return {
      type: "web_vital",
      route,
      name: value.name,
      value: value.value,
      rating: value.rating as WebVitalRating | null,
    };
  }

  if (value.type === "client_error") {
    if (!hasOnlyKeys(value, CLIENT_ERROR_FIELDS)) return null;
    if (typeof value.kind !== "string" || !CLIENT_ERROR_KIND_SET.has(value.kind)) return null;
    if (typeof value.errorName !== "string" || !SAFE_ERROR_NAME.test(value.errorName)) return null;
    return {
      type: "client_error",
      route,
      kind: value.kind as ClientErrorKind,
      errorName: value.errorName,
    };
  }

  return null;
}
