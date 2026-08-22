import type { MovementFilters } from "@/lib/financial/movements";

export type TriFilter = "" | "1" | "0";
export type MovementSort = NonNullable<MovementFilters["sort"]>;

export type MovementFilterState = {
  search: string;
  account: string;
  type: string;
  category: string;
  subcategory: string;
  merchant: string;
  channel: string;
  tag: string;
  review: boolean;
  cashFlowOnly: boolean;
  duplicate: TriFilter;
  recurring: TriFilter;
  internalTransfer: TriFilter;
  reconciled: TriFilter;
  documents: TriFilter;
  splits: TriFilter;
  from: string;
  to: string;
  min: string;
  max: string;
  sort: MovementSort;
};

export const EMPTY_MOVEMENT_FILTERS: MovementFilterState = {
  search: "",
  account: "",
  type: "",
  category: "",
  subcategory: "",
  merchant: "",
  channel: "",
  tag: "",
  review: false,
  cashFlowOnly: false,
  duplicate: "",
  recurring: "",
  internalTransfer: "",
  reconciled: "",
  documents: "",
  splits: "",
  from: "",
  to: "",
  min: "",
  max: "",
  sort: "date_desc",
};

const SORTS = new Set<MovementSort>(["date_desc", "date_asc", "amount_desc", "amount_asc"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRUE_VALUES = new Set(["1", "true", "yes", "si", "sí"]);

function text(value: string | undefined) { return typeof value === "string" ? value.trim() : ""; }
function tri(value: string | undefined): TriFilter { const normalized=text(value).toLowerCase(); return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "si" || normalized === "sí" ? "1" : normalized === "0" || normalized === "false" || normalized === "no" ? "0" : ""; }
function flag(value: string | undefined) { return TRUE_VALUES.has(text(value).toLowerCase()); }
function date(value: string | undefined) { const normalized=text(value); return DATE_RE.test(normalized) ? normalized : ""; }
function amount(value: string | undefined) { const normalized=text(value); if (!normalized) return ""; return Number.isFinite(Number(normalized.replace(",", "."))) ? normalized : ""; }

export function parseMovementSearchParams(params: Record<string, string | undefined>): MovementFilterState {
  const requestedSort = text(params.sort) as MovementSort;
  return {
    search: text(params.search), account: text(params.account), type: text(params.type), category: text(params.category), subcategory: text(params.subcategory), merchant: text(params.merchant), channel: text(params.channel), tag: text(params.tag),
    review: flag(params.review), cashFlowOnly: flag(params.cashFlow), duplicate: tri(params.duplicate), recurring: tri(params.recurring), internalTransfer: tri(params.internalTransfer), reconciled: tri(params.reconciled), documents: tri(params.documents), splits: tri(params.splits),
    from: date(params.from), to: date(params.to), min: amount(params.min), max: amount(params.max), sort: SORTS.has(requestedSort) ? requestedSort : "date_desc",
  };
}
function numeric(value: string) { if (!value.trim()) return null; const parsed=Number(value.replace(",", ".")); return Number.isFinite(parsed) ? parsed : null; }
function bool(value: TriFilter) { return value === "1" ? true : value === "0" ? false : null; }

export function movementFiltersForData(state: MovementFilterState): MovementFilters {
  return { page:1,pageSize:50,search:state.search||null,accountId:state.account||null,type:state.type||null,category:state.category||null,subcategory:state.subcategory||null,merchant:state.merchant||null,channel:state.channel||null,tag:state.tag||null,reviewOnly:state.review,cashFlowOnly:state.cashFlowOnly,duplicate:bool(state.duplicate),recurring:bool(state.recurring),internalTransfer:bool(state.internalTransfer),reconciled:bool(state.reconciled),hasDocuments:bool(state.documents),hasSplits:bool(state.splits),dateFrom:state.from||null,dateTo:state.to||null,minAmount:numeric(state.min),maxAmount:numeric(state.max),sort:state.sort };
}

export function movementSearchParams(state: MovementFilterState) {
  const q=new URLSearchParams();
  if(state.search)q.set("search",state.search);if(state.account)q.set("account",state.account);if(state.type)q.set("type",state.type);if(state.category)q.set("category",state.category);if(state.subcategory)q.set("subcategory",state.subcategory);if(state.merchant)q.set("merchant",state.merchant);if(state.channel)q.set("channel",state.channel);if(state.tag)q.set("tag",state.tag);if(state.review)q.set("review","1");if(state.cashFlowOnly)q.set("cashFlow","1");if(state.duplicate)q.set("duplicate",state.duplicate);if(state.recurring)q.set("recurring",state.recurring);if(state.internalTransfer)q.set("internalTransfer",state.internalTransfer);if(state.reconciled)q.set("reconciled",state.reconciled);if(state.documents)q.set("documents",state.documents);if(state.splits)q.set("splits",state.splits);if(state.from)q.set("from",state.from);if(state.to)q.set("to",state.to);if(state.min)q.set("min",state.min);if(state.max)q.set("max",state.max);if(state.sort!=="date_desc")q.set("sort",state.sort);return q;
}
export function movementUrl(state: MovementFilterState) { const query=movementSearchParams(state).toString(); return query?`/movimientos?${query}`:"/movimientos"; }
export function movementState(overrides: Partial<MovementFilterState> = {}): MovementFilterState { return { ...EMPTY_MOVEMENT_FILTERS, ...overrides }; }
export type MovementBucket = "day" | "week" | "month";
function isoDate(dateValue: Date) { return dateValue.toISOString().slice(0, 10); }
export function bucketBounds(start: string, bucket: MovementBucket, minDate?: string, maxDate?: string) { const parsed=new Date(`${start}T00:00:00Z`); if(Number.isNaN(parsed.getTime()))return{from:minDate||start,to:maxDate||start};const end=new Date(parsed);if(bucket==="week")end.setUTCDate(end.getUTCDate()+6);if(bucket==="month"){end.setUTCMonth(end.getUTCMonth()+1,1);end.setUTCDate(0);}let from=start;let to=isoDate(end);if(minDate&&from<minDate)from=minDate;if(maxDate&&to>maxDate)to=maxDate;return{from,to};}
