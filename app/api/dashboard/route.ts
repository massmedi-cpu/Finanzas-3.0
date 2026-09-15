import {
  callPersistenceGatewayBatch,
  PersistenceGatewayError,
  type PersistenceGatewayOperation,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
};

const SCOPES = new Set(["primary", "secondary", "all"] as const);
type DashboardScope = "primary" | "secondary" | "all";
type DashboardSource = "financial" | "monthly" | "budgets" | "forecast" | "transactions";

type NamedOperation = PersistenceGatewayOperation & {
  source: DashboardSource;
};

function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Madrid",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function trailingMonthStart(date: string, months: number) {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, 1));
  parsed.setUTCMonth(parsed.getUTCMonth() - Math.max(0, months - 1));
  return parsed.toISOString().slice(0, 10);
}

function transactionOperation(): NamedOperation {
  return {
    source: "transactions",
    action: "transaction.query",
    payload: {
      query: null,
      accountId: null,
      categoryId: null,
      merchantId: null,
      kind: null,
      reviewState: null,
      duplicateState: null,
      dateFrom: null,
      dateTo: null,
      cursorBankDate: null,
      cursorId: null,
      limit: 10,
      uncategorized: false,
    },
  };
}

function operationsForScope(scope: DashboardScope, today: string): NamedOperation[] {
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const cashFlowStart = trailingMonthStart(today, 12);
  const forecastTo = addDays(today, 30);

  const financial: NamedOperation = {
    source: "financial",
    action: "financial.snapshot",
    payload: {
      dateFrom: monthStart,
      dateTo: today,
      accountId: null,
      includeArchived: false,
    },
  };

  const transactions = transactionOperation();
  const secondary: NamedOperation[] = [
    {
      source: "monthly",
      action: "financial.monthly",
      payload: {
        dateFrom: cashFlowStart,
        dateTo: today,
        accountId: null,
        includeArchived: false,
      },
    },
    {
      source: "budgets",
      action: "budget.snapshot",
      payload: { month },
    },
    {
      source: "forecast",
      action: "forecast.snapshot",
      payload: {
        dateFrom: today,
        dateTo: forecastTo,
        accountId: null,
      },
    },
  ];

  if (scope === "primary") return [financial, transactions];
  if (scope === "secondary") return secondary;
  return [financial, transactions, ...secondary];
}

function emptyData() {
  return {
    financial: null,
    monthly: null,
    budgets: null,
    forecast: null,
    transactions: null,
  } as Record<DashboardSource, unknown | null>;
}

function responseHeaders(scope: DashboardScope, durationMs: number) {
  return {
    ...HEADERS,
    "x-dashboard-scope": scope,
    "server-timing": `dashboard;dur=${durationMs.toFixed(1)}`,
  };
}

function latestBankDate(data: Record<DashboardSource, unknown | null>) {
  const transactions = data.transactions as { rows?: Array<{ bankDate?: unknown }> } | null;
  const bankDate = transactions?.rows?.[0]?.bankDate;
  return typeof bankDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(bankDate) ? bankDate : null;
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const { searchParams } = new URL(request.url);
  const rawScope = searchParams.get("scope") ?? "all";

  if (!SCOPES.has(rawScope as DashboardScope)) {
    return Response.json(
      { error: "invalid_request", code: "invalid_dashboard_scope" },
      { status: 400, headers: HEADERS },
    );
  }

  const scope = rawScope as DashboardScope;
  const today = madridToday();
  const operations = operationsForScope(scope, today);
  const requestedSources = operations.map((operation) => operation.source);
  const data = emptyData();

  try {
    const results = await callPersistenceGatewayBatch(operations);
    const failedSources: DashboardSource[] = [];

    results.forEach((result, index) => {
      const source = operations[index].source;
      if (result.status === "fulfilled") data[source] = result.value;
      else failedSources.push(source);
    });

    const durationMs = performance.now() - startedAt;
    const allRequestedFailed = failedSources.length === requestedSources.length;

    return Response.json(
      {
        contractVersion: 1,
        scope,
        asOfDate: today,
        dataThroughDate: latestBankDate(data),
        generatedAt: new Date().toISOString(),
        requestedSources,
        failedSources,
        data,
      },
      {
        status: allRequestedFailed ? 503 : 200,
        headers: responseHeaders(scope, durationMs),
      },
    );
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    const code = error instanceof PersistenceGatewayError ? error.code ?? null : null;
    console.error("dashboard-api", error instanceof Error ? error.name : typeof error, code ?? "");

    return Response.json(
      {
        error: "dashboard_unavailable",
        code,
        scope,
        requestedSources,
        failedSources: requestedSources,
        dataThroughDate: null,
        data,
      },
      { status: 503, headers: responseHeaders(scope, durationMs) },
    );
  }
}
