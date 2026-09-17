import { callPersistenceGateway } from "../../infrastructure/persistence/vercel-supabase-gateway";
import { isForecastSnapshot, type ForecastSnapshot } from "./forecast-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

function validDate(value: string, code: string) {
  if (!DATE.test(value)) throw new Error(code);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(code);
  return value;
}

export type ForecastSelectionInput = {
  dateFrom?: string | null;
  dateTo?: string | null;
  accountId?: string | null;
};

export type ResolvedForecastSelection = {
  dateFrom: string;
  dateTo: string;
  accountId: string | null;
};

export function resolveForecastSelection(input: ForecastSelectionInput = {}): ResolvedForecastSelection {
  const today = madridToday();
  const dateFromCandidate = input.dateFrom?.trim() || addDays(today, 1);
  const dateToCandidate = input.dateTo?.trim() || addDays(today, 90);
  const dateFrom = validDate(dateFromCandidate, "invalid_forecast_date_from");
  const dateTo = validDate(dateToCandidate, "invalid_forecast_date_to");
  if (dateFrom > dateTo) throw new Error("invalid_forecast_date_range");

  const accountCandidate = input.accountId?.trim() || null;
  if (accountCandidate !== null && !UUID.test(accountCandidate)) {
    throw new Error("invalid_forecast_account_id");
  }

  return {
    dateFrom,
    dateTo,
    accountId: accountCandidate,
  };
}

export async function loadForecastSnapshot(input: ForecastSelectionInput = {}): Promise<ForecastSnapshot> {
  const selection = resolveForecastSelection(input);
  const result = await callPersistenceGateway<ForecastSnapshot>("forecast.snapshot", selection);
  if (!isForecastSnapshot(result)) throw new Error("invalid_forecast_snapshot_contract");
  return result;
}
