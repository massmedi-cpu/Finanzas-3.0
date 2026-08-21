import { createClient } from "@/lib/supabase/server";

export type MovementAccount = {
  id: string | null;
  name: string | null;
  identifier: string | null;
  role: string | null;
};

export type MovementItem = {
  id: string;
  sourceId: string;
  date: string | null;
  sourceDate: string | null;
  time: string | null;
  account: MovementAccount;
  amount: number | null;
  balance: number | null;
  type: string | null;
  sourceType: string | null;
  category: string | null;
  sourceCategory: string | null;
  subcategory: string | null;
  sourceSubcategory: string | null;
  concept: string | null;
  sourceOriginalConcept: string | null;
  sourceNormalizedConcept: string | null;
  counterparty: string | null;
  sourceCounterparty: string | null;
  channel: string | null;
  status: string;
  sourceMissing: boolean;
  needsReview: boolean;
  isInternalTransfer: boolean;
  isDuplicate: boolean;
  isReconciled: boolean | null;
  isRecurring: boolean | null;
  cashFlowOverride: boolean | null;
  tags: string[];
  notes: string | null;
  hasOverrides: boolean;
  updatedAt: string;
};

export type MovementFacets = {
  accounts: Array<{ id: string; name: string; identifier: string }>;
  types: string[];
  categories: string[];
};

export type MovementsResponse = {
  ok: true;
  page: number;
  pageSize: number;
  total: number;
  items: MovementItem[];
  facets: MovementFacets;
};

export type MovementFilters = {
  page?: number;
  pageSize?: number;
  search?: string | null;
  accountId?: string | null;
  type?: string | null;
  category?: string | null;
  reviewOnly?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
};

export type TransactionHistoryEntry = {
  id: number;
  field: string;
  origin: unknown;
  before: unknown;
  after: unknown;
  changeOrigin: string;
  changedBy: string | null;
  changedAt: string;
};

export type TransactionDetail = {
  id: string;
  sourceId: string;
  source: Record<string, unknown>;
  effective: {
    date: string | null;
    type: string | null;
    category: string | null;
    subcategory: string | null;
    normalizedConcept: string | null;
    counterparty: string | null;
    description: string | null;
    cashFlowOverride: boolean | null;
    isInternalTransfer: boolean;
    isDuplicate: boolean;
    isReconciled: boolean | null;
    needsReview: boolean;
    isRecurring: boolean | null;
    tags: string[];
    notes: string | null;
  };
  overrides: Record<string, unknown>;
  account: MovementAccount;
  status: string;
  sourceMissing: boolean;
  updatedAt: string;
  history: TransactionHistoryEntry[];
};

export type TransactionDetailResponse = { ok: true; transaction: TransactionDetail };

export async function getMovements(filters: MovementFilters = {}): Promise<MovementsResponse> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("financial_app_movements", {
    p_page: filters.page ?? 1,
    p_page_size: filters.pageSize ?? 50,
    p_search: filters.search || null,
    p_account_id: filters.accountId || null,
    p_type: filters.type || null,
    p_category: filters.category || null,
    p_review_only: filters.reviewOnly ?? false,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_min_amount: filters.minAmount ?? null,
    p_max_amount: filters.maxAmount ?? null,
    p_sort: filters.sort ?? "date_desc",
  });
  if (error || !data) throw new Error(error?.message || "movements_unavailable");
  return data as MovementsResponse;
}

export async function getTransactionDetail(id: string): Promise<TransactionDetailResponse> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("financial_app_transaction_detail", { p_transaction_id: id });
  if (error || !data) throw new Error(error?.message || "transaction_unavailable");
  return data as TransactionDetailResponse;
}
