import { callPersistenceGateway } from "../../infrastructure/persistence/vercel-supabase-gateway";
import { isAnalysisSnapshot } from "./analysis-contract";
import {
  buildAnalysisSnapshot,
  type AnalysisGatewaySnapshot,
  type AnalysisRange,
  type AnalysisSnapshot,
} from "./analysis-engine";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RANGES = new Set<AnalysisRange>(["1m", "3m", "6m", "12m", "ytd"]);
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

function dayBefore(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export type AnalysisSelectionInput = {
  month?: string | null;
  range?: string | null;
  accountId?: string | null;
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
  const month = input.month?.trim() || currentMonth;
  if (!MONTH.test(month)) throw new Error("invalid_analysis_month");
  if (month > currentMonth) throw new Error("invalid_analysis_future_month");

  const rangeCandidate = input.range?.trim() || "1m";
  if (!RANGES.has(rangeCandidate as AnalysisRange)) throw new Error("invalid_analysis_range");
  const range = rangeCandidate as AnalysisRange;

  const accountCandidate = input.accountId?.trim() || null;
  if (accountCandidate !== null && !UUID.test(accountCandidate)) throw new Error("invalid_analysis_account_id");

  const endOfAnchorMonth = monthEnd(month);
  const partial = month === currentMonth && today < endOfAnchorMonth;
  const dateTo = partial ? today : endOfAnchorMonth;
  let dateFrom: string;
  let previousDateFrom: string;
  let previousDateTo: string;

  if (range === "ytd") {
    const year = Number(month.slice(0, 4));
    dateFrom = `${year}-01-01`;
    previousDateFrom = `${year - 1}-01-01`;
    previousDateTo = shiftDateMonths(dateTo, -12);
  } else {
    const months = RANGE_MONTHS[range];
    dateFrom = shiftMonthStart(month, -(months - 1));
    previousDateFrom = shiftMonthStart(dateFrom.slice(0, 7), -months);
    previousDateTo = partial ? shiftDateMonths(dateTo, -months) : dayBefore(dateFrom);
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
    historyDateFrom: shiftMonthStart(month, -11),
    partial,
    partialMonthStart: partial ? monthStart(month) : null,
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
