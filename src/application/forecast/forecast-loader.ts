import { callPersistenceGateway } from "../../infrastructure/persistence/vercel-supabase-gateway";
import { isForecastSnapshot, type ForecastSnapshot } from "./forecast-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export type ForecastSelectionInput = {
  accountId?: string | null;
};

export type ResolvedForecastSelection = {
  dateFrom: string;
  dateTo: string;
  accountId: string | null;
};

export function resolveForecastSelection(input: ForecastSelectionInput = {}): ResolvedForecastSelection {
  const today = madridToday();
  const accountCandidate = input.accountId?.trim() || null;
  if (accountCandidate !== null && !UUID.test(accountCandidate)) {
    throw new Error("invalid_forecast_account_id");
  }

  return {
    dateFrom: addDays(today, 1),
    dateTo: addDays(today, 90),
    accountId: accountCandidate,
  };
}

export async function loadForecastSnapshot(input: ForecastSelectionInput = {}): Promise<ForecastSnapshot> {
  const selection = resolveForecastSelection(input);
  const result = await callPersistenceGateway<ForecastSnapshot>("forecast.snapshot", selection);
  if (!isForecastSnapshot(result)) throw new Error("invalid_forecast_snapshot_contract");
  return result;
}
