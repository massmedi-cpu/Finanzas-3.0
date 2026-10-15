/**
 * The dashboard is a composite of separately sourced financial views.
 * Never let an apparently successful response put one scope's money into
 * another scope, hide failed sources, or silently accept extra data.
 */
export type HomeDashboardSource = "financial" | "monthly" | "budgets" | "forecast" | "transactions";
export type HomeDashboardScope = "critical" | "activity" | "primary" | "secondary" | "all";

export const HOME_DASHBOARD_SOURCES: readonly HomeDashboardSource[] = [
  "financial", "monthly", "budgets", "forecast", "transactions",
];

export const HOME_SCOPE_SOURCES: Record<HomeDashboardScope, readonly HomeDashboardSource[]> = {
  critical: ["financial"],
  activity: ["transactions"],
  primary: ["financial", "transactions"],
  secondary: ["monthly", "budgets", "forecast"],
  all: ["financial", "transactions", "monthly", "budgets", "forecast"],
};

export type VerifiedDashboardEnvelope = {
  contractVersion: 1;
  scope: HomeDashboardScope;
  asOfDate: string;
  dataThroughDate: string | null;
  generatedAt: string;
  requestedSources: HomeDashboardSource[];
  failedSources: HomeDashboardSource[];
  data: Record<HomeDashboardSource, unknown | null>;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** No user-specific fields are logged or sent to telemetry when the contract fails. */
export function isDashboardEnvelopeForScope(
  value: unknown,
  scope: HomeDashboardScope,
): value is VerifiedDashboardEnvelope {
  if (!record(value) || value.contractVersion !== 1 || value.scope !== scope
    || !validDay(value.asOfDate)
    || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))
    || !(value.dataThroughDate == null || validDay(value.dataThroughDate))
    || !Array.isArray(value.requestedSources) || !Array.isArray(value.failedSources)
    || !record(value.data)) return false;

  const expected = HOME_SCOPE_SOURCES[scope];
  // Capture the narrowed arrays in locals before callbacks; TypeScript does
  // not preserve a property-narrowing across an asynchronous closure boundary.
  const requestedSources = value.requestedSources;
  const failedSources = value.failedSources;
  if (requestedSources.length !== expected.length
    || expected.some((source, index) => requestedSources[index] !== source)
    || failedSources.length > expected.length) return false;

  const failed = new Set<HomeDashboardSource>();
  for (const source of failedSources) {
    if (typeof source !== "string" || !expected.includes(source as HomeDashboardSource)
      || failed.has(source as HomeDashboardSource)) return false;
    failed.add(source as HomeDashboardSource);
  }
  const data = value.data;
  const keys = Object.keys(data);
  if (keys.length !== HOME_DASHBOARD_SOURCES.length
    || keys.some((key) => !HOME_DASHBOARD_SOURCES.includes(key as HomeDashboardSource))) return false;
  // A failed or unrequested source MUST remain absent; a stray total cannot
  // contaminate a privacy-sensitive aggregate, even if the HTTP status is 200.
  return HOME_DASHBOARD_SOURCES.every((source) =>
    !(source in data) ? false
      : expected.includes(source) && !failed.has(source)
        ? data[source] === null || record(data[source])
        : data[source] === null
  );
}
