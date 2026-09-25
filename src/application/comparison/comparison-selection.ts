const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_COMPARISON_DAYS = 366;

export type ComparisonSelectionInput = {
  primaryFrom?: string | null;
  primaryTo?: string | null;
  referenceFrom?: string | null;
  referenceTo?: string | null;
  accountId?: string | null;
};

export type ResolvedComparisonSelection = {
  today: string;
  primaryFrom: string;
  primaryTo: string;
  referenceFrom: string;
  referenceTo: string;
  primaryDays: number;
  referenceDays: number;
  accountId: string | null;
  historyDateFrom: string;
  budgetMonth: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateParts(value: string) {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error("invalid_comparison_date");
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1
    || candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() + 1 !== month
    || candidate.getUTCDate() !== day
  ) {
    throw new Error("invalid_comparison_date");
  }
  return { year, month, day };
}

function shiftMonthStart(value: string, deltaMonths: number) {
  const { year, month } = dateParts(value);
  const shifted = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-01`;
}

function previousMonthMatchingDay(today: string) {
  const { year, month, day } = dateParts(today);
  const target = new Date(Date.UTC(year, month - 2, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${pad(targetMonth)}-${pad(Math.min(day, lastDay))}`;
}

function daysInclusive(dateFrom: string, dateTo: string) {
  const from = dateParts(dateFrom);
  const to = dateParts(dateTo);
  const fromTime = Date.UTC(from.year, from.month - 1, from.day);
  const toTime = Date.UTC(to.year, to.month - 1, to.day);
  return Math.floor((toTime - fromTime) / 86_400_000) + 1;
}

function valueOrNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

export function madridToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function resolveComparisonSelection(
  input: ComparisonSelectionInput = {},
  today = madridToday(),
): ResolvedComparisonSelection {
  dateParts(today);

  const requestedDates = [
    valueOrNull(input.primaryFrom),
    valueOrNull(input.primaryTo),
    valueOrNull(input.referenceFrom),
    valueOrNull(input.referenceTo),
  ] as const;
  const requestedCount = requestedDates.filter(Boolean).length;
  if (requestedCount !== 0 && requestedCount !== requestedDates.length) {
    throw new Error("invalid_comparison_periods");
  }

  const primaryFrom = requestedDates[0] ?? `${today.slice(0, 7)}-01`;
  const primaryTo = requestedDates[1] ?? today;
  const referenceFrom = requestedDates[2] ?? shiftMonthStart(today, -1);
  const referenceTo = requestedDates[3] ?? previousMonthMatchingDay(today);

  dateParts(primaryFrom);
  dateParts(primaryTo);
  dateParts(referenceFrom);
  dateParts(referenceTo);

  if (primaryFrom > primaryTo || referenceFrom > referenceTo) {
    throw new Error("invalid_comparison_period_order");
  }
  if (referenceTo >= primaryFrom) {
    throw new Error("invalid_comparison_overlap");
  }
  if (primaryTo > today || referenceTo > today) {
    throw new Error("invalid_comparison_future_date");
  }

  const primaryDays = daysInclusive(primaryFrom, primaryTo);
  const referenceDays = daysInclusive(referenceFrom, referenceTo);
  if (primaryDays > MAX_COMPARISON_DAYS || referenceDays > MAX_COMPARISON_DAYS) {
    throw new Error("comparison_period_too_large");
  }

  const accountId = valueOrNull(input.accountId);
  if (accountId !== null && !UUID.test(accountId)) {
    throw new Error("invalid_comparison_account_id");
  }

  return {
    today,
    primaryFrom,
    primaryTo,
    referenceFrom,
    referenceTo,
    primaryDays,
    referenceDays,
    accountId,
    historyDateFrom: shiftMonthStart(primaryTo, -11),
    budgetMonth: primaryTo.slice(0, 7),
  };
}

export function comparisonSelectionSearchParams(selection: ResolvedComparisonSelection) {
  const params = new URLSearchParams({
    primaryFrom: selection.primaryFrom,
    primaryTo: selection.primaryTo,
    referenceFrom: selection.referenceFrom,
    referenceTo: selection.referenceTo,
  });
  if (selection.accountId) params.set("accountId", selection.accountId);
  return params;
}
