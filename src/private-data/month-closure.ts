import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../security/session';

const CLOSURE_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-closure';

export interface MonthClosureRecord {
  year_month: string;
  status: 'open' | 'closed';
  closed_at: string | null;
  reopened_at: string | null;
  note: string | null;
  snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MonthClosureSummary {
  year_month: string;
  movement_count: number | string;
  pending_review: number | string;
  unreconciled: number | string;
  uncategorized: number | string;
  transfer_count: number | string;
  income: number | string;
  expenses: number | string;
  net_cash_flow: number | string;
}

async function closureRequest<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { status: 401, data: { ok: false, error: 'private-session-required' } as T };
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${CLOSURE_URL}${path}`, { ...init, headers, cache: 'no-store' });
  const data = (await response.json().catch(() => ({ ok: false, error: 'invalid-closure-response' }))) as T;
  return { status: response.status, data };
}

export async function getMonthClosureSummary(yearMonth: string): Promise<MonthClosureSummary> {
  const response = await closureRequest<{ ok?: boolean; summary?: MonthClosureSummary; error?: string }>(`/summary?yearMonth=${encodeURIComponent(yearMonth)}`);
  if (response.status !== 200 || !response.data.ok || !response.data.summary) throw new Error(response.data.error || `closure-summary-${response.status}`);
  return response.data.summary;
}

export async function getMonthClosure(yearMonth: string): Promise<MonthClosureRecord | null> {
  const response = await closureRequest<{ ok?: boolean; closure?: MonthClosureRecord | null; error?: string }>(`/month?yearMonth=${encodeURIComponent(yearMonth)}`);
  if (response.status !== 200 || !response.data.ok) throw new Error(response.data.error || `closure-month-${response.status}`);
  return response.data.closure ?? null;
}

export async function mutateMonthClosure(body: Record<string, unknown>) {
  return closureRequest<{ ok?: boolean; closure?: MonthClosureRecord; error?: string }>('/month', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
