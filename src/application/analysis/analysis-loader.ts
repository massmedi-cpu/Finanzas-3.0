import { callPersistenceGateway } from "../../infrastructure/persistence/vercel-supabase-gateway";
import { isAnalysisSnapshot } from "./analysis-contract";
import {
  buildAnalysisSnapshot,
  type AnalysisGatewaySnapshot,
  type AnalysisRange,
  type AnalysisSnapshot,
} from "./analysis-engine";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const YEAR = /^\d{4}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RANGES = new Set<AnalysisRange>(["1m", "3m", "6m", "12m", "ytd"]);
const PERIOD_MODES = new Set(["preset", "month", "year", "custom"]);
const COMPARISON_MODES = new Set(["previous", "year_ago", "custom"]);
const RANGE_MONTHS: Record<Exclude<AnalysisRange, "ytd">, number> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "12m": 12,
};

function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function madridMonth() {
  return madridToday().slice(0, 7);
}

function monthStart(month: string) {
  return `${month}-01`;
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function shiftMonthStart(month: string, deltaMonths: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + deltaMonths, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function shiftDateMonths(date: string, deltaMonths: number) {
  const [year, month, day] = date.split("-").map(Number);
  const targetFirst = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  const targetYear = targetFirst.getUTCFullYear();
  const targetMonth = targetFirst.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function shiftDays(date: string, deltaDays: number) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays);
  return shifted.toISOString().slice(0, 10);
}

function dayBefore(date: string) {
  return shiftDays(date, -1);
}

function inclusiveDays(dateFrom: string, dateTo: string) {
  const from = Date.parse(`${dateFrom}T00:00:00Z`);
  const to = Date.parse(`${dateTo}T00:00:00Z`);
  return Math.floor((to - from) / 86_400_000) + 1;
}

function validDate(value: string) {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function requireDate(value: string | null | undefined, code: string) {
  const normalized = value?.trim() ?? "";
  if (!validDate(normalized)) throw new Error(code);
  return normalized;
}

function minDate(...values: string[]) {
  return [...values].sort()[0];
}

export type AnalysisSelectionInput = {
  month?: string | null;
  range?: string | null;
  accountId?: string | null;
  periodMode?: string | null;
  year?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  compareMode?: string | null;
  compareDateFrom?: string | null;
  compareDateTo?: string | null;
};

export type ResolvedAnalysisSelection = {
  today: string;
  range: AnalysisRange;
  month: string;
  accountId: string | null;
  dateFrom: string;
  dateTo: string;
  previousDateFrom: string;
  previousDateTo: string;
  historyDateFrom: string;
  partial: boolean;
  partialMonthStart: string | null;
};

export function resolveAnalysisSelection(input: AnalysisSelectionInput = {}): ResolvedAnalysisSelection {
  const today = madridToday();
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);
  const accountCandidate = input.accountId?.trim() || null;
  if (accountCandidate !== null && !UUID.test(accountCandidate)) throw new Error("invalid_analysis_account_id");

  const requestedPeriodMode = input.periodMode?.trim() || ((input.dateFrom || input.dateTo) ? "custom" : "preset");
  if (!PERIOD_MODES.has(requestedPeriodMode)) throw new Error("invalid_analysis_period_mode");

  let month = input.month?.trim() || currentMonth;
  let range: AnalysisRange = "1m";
  let dateFrom: string;
  let dateTo: string;
  let partial = false;
  let partialMonthStart: string | null = null;

  if (requestedPeriodMode === "month") {
    if (!MONTH.test(month) || month > currentMonth) throw new Error("invalid_analysis_month");
    range = "1m";
    dateFrom = monthStart(month);
    const end = monthEnd(month);
    partial = month === currentMonth && today < end;
    dateTo = partial ? today : end;
    partialMonthStart = partial ? monthStart(month) : null;
  } else if (requestedPeriodMode === "year") {
    const year = input.year?.trim() || month.slice(0, 4) || currentYear;
    if (!YEAR.test(year) || year > currentYear) throw new Error("invalid_analysis_year");
    dateFrom = `${year}-01-01`;
    dateTo = year === currentYear ? today : `${year}-12-31`;
    month = year === currentYear ? currentMonth : `${year}-12`;
    range = "ytd";
    partial = year === currentYear;
    partialMonthStart = partial && today < monthEnd(currentMonth) ? monthStart(currentMonth) : null;
  } else if (requestedPeriodMode === "custom") {
    dateFrom = requireDate(input.dateFrom, "invalid_analysis_date_from");
    dateTo = requireDate(input.dateTo, "invalid_analysis_date_to");
    if (dateFrom > dateTo) throw new Error("invalid_analysis_date_range");
    if (dateTo > today) throw new Error("invalid_analysis_future_date");
    month = dateTo.slice(0, 7);
    range = "12m";
    partial = dateTo === today && month === currentMonth && today < monthEnd(currentMonth);
    partialMonthStart = partial ? monthStart(currentMonth) : null;
  } else {
    if (!MONTH.test(month)) throw new Error("invalid_analysis_month");
    if (month > currentMonth) throw new Error("invalid_analysis_future_month");

    const rangeCandidate = input.range?.trim() || "1m";
    if (!RANGES.has(rangeCandidate as AnalysisRange)) throw new Error("invalid_analysis_range");
    range = rangeCandidate as AnalysisRange;

    const endOfAnchorMonth = monthEnd(month);
    partial = month === currentMonth && today < endOfAnchorMonth;
    dateTo = partial ? today : endOfAnchorMonth;

    if (range === "ytd") {
      const year = Number(month.slice(0, 4));
      dateFrom = `${year}-01-01`;
    } else {
      const months = RANGE_MONTHS[range];
      dateFrom = shiftMonthStart(month, -(months - 1));
    }
    partialMonthStart = partial ? monthStart(month) : null;
  }

  const comparisonMode = input.compareMode?.trim() || "previous";
  if (!COMPARISON_MODES.has(comparisonMode)) throw new Error("invalid_analysis_comparison_mode");

  let previousDateFrom: string;
  let previousDateTo: string;
  if (comparisonMode === "year_ago") {
    previousDateFrom = shiftDateMonths(dateFrom, -12);
    previousDateTo = shiftDateMonths(dateTo, -12);
  } else if (comparisonMode === "custom") {
    previousDateFrom = requireDate(input.compareDateFrom, "invalid_analysis_compare_date_from");
    previousDateTo = requireDate(input.compareDateTo, "invalid_analysis_compare_date_to");
    if (previousDateFrom > previousDateTo) throw new Error("invalid_analysis_compare_date_range");
    if (previousDateTo > today) throw new Error("invalid_analysis_compare_future_date");
    if (previousDateTo >= dateFrom) throw new Error("invalid_analysis_compare_period_order");
  } else {
    const days = inclusiveDays(dateFrom, dateTo);
    previousDateTo = dayBefore(dateFrom);
    previousDateFrom = shiftDays(previousDateTo, -(days - 1));
  }

  return {
    today,
    range,
    month,
    accountId: accountCandidate,
    dateFrom,
    dateTo,
    previousDateFrom,
    previousDateTo,
    historyDateFrom: minDate(shiftMonthStart(month, -11), monthStart(dateFrom.slice(0, 7))),
    partial,
    partialMonthStart,
  };
}

export async function loadAnalysisSnapshot(input: AnalysisSelectionInput = {}): Promise<AnalysisSnapshot> {
  const selection = resolveAnalysisSelection(input);
  const gateway = await callPersistenceGateway<AnalysisGatewaySnapshot>("financial.snapshot", {
    analysis: true,
    today: selection.today,
    dateFrom: selection.dateFrom,
    dateTo: selection.dateTo,
    previousDateFrom: selection.previousDateFrom,
    previousDateTo: selection.previousDateTo,
    historyDateFrom: selection.historyDateFrom,
    budgetMonth: selection.month,
    accountId: selection.accountId,
  });

  const snapshot = buildAnalysisSnapshot({
    range: selection.range,
    month: selection.month,
    accountId: selection.accountId,
    dateFrom: selection.dateFrom,
    dateTo: selection.dateTo,
    previousDateFrom: selection.previousDateFrom,
    previousDateTo: selection.previousDateTo,
    partial: selection.partial,
    partialMonthStart: selection.partialMonthStart,
    gateway,
  });

  if (!isAnalysisSnapshot(snapshot)) {
    throw new Error("analysis_contract_invalid");
  }

  return snapshot;
}
