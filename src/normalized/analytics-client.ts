import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../security/session';
import type { CategoryReportRow, MonthlyReportRow, QuarterlyReportRow, YearComparison, YearlyReport } from '../domain/report-engine';

const ANALYTICS_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-analytics';

async function analyticsRequest<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('private-session-required');

  const response = await fetch(`${ANALYTICS_URL}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({ ok: false, error: 'invalid-analytics-response' }))) as T & { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) throw new Error(data.error || `analytics-${response.status}`);
  return data;
}

export interface NormalizedReports {
  ok: boolean;
  availableYears: string[];
  selectedYear: string | null;
  monthly: MonthlyReportRow[];
  quarterly: QuarterlyReportRow[];
  categories: CategoryReportRow[];
  yearly: YearlyReport | null;
  previousYear: string | null;
  comparison: YearComparison | null;
  splitCount: number;
}

export interface NormalizedBudgetRow {
  category: string;
  spent: number | string;
  transactions: number;
  assigned: number | string;
  carryIn: number | string;
  rollover: boolean;
}

export interface NormalizedBudget {
  ok: boolean;
  availableMonths: string[];
  selectedMonth: string | null;
  monthlyIncome: number | string;
  rows: NormalizedBudgetRow[];
}

export type NormalizedReviewStatus = 'pending' | 'reviewed' | 'ignored';
export type NormalizedReviewIssueType = 'duplicate' | 'review' | 'uncategorized' | 'unusual_amount';
export type NormalizedReviewSeverity = 'high' | 'medium' | 'low';

export interface NormalizedReviewMovement {
  id: string;
  date: string;
  account: string;
  concept: string;
  amount: number | string | null;
  category: string;
  subcategory: string;
  merchant: string;
  notes: string;
  reconciled: boolean;
  excludedFromAnalytics: boolean;
  reviewStatus: NormalizedReviewStatus;
}

export interface NormalizedReviewIssue {
  id: string;
  type: NormalizedReviewIssueType;
  severity: NormalizedReviewSeverity;
  title: string;
  detail: string;
  sourceIds: string[];
  movements: NormalizedReviewMovement[];
}

export interface NormalizedReview {
  ok: boolean;
  issues: NormalizedReviewIssue[];
  total: number;
}

export function getNormalizedReports(year?: string) {
  const params = new URLSearchParams();
  if (year) params.set('year', year);
  return analyticsRequest<NormalizedReports>(`/reports${params.size ? `?${params}` : ''}`);
}

export function getNormalizedBudget(month?: string) {
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  return analyticsRequest<NormalizedBudget>(`/budget${params.size ? `?${params}` : ''}`);
}

export function getNormalizedReview() {
  return analyticsRequest<NormalizedReview>('/review');
}
