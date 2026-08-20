import { cache } from 'react';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../security/session';

const PRIVATE_DATA_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-data';

export type ReviewStatus = 'pending' | 'reviewed' | 'ignored';
export type FutureEventRecurrence = 'once' | 'monthly' | 'yearly';

export interface MovementOverride {
  source_id: string;
  category: string | null;
  subcategory: string | null;
  merchant: string | null;
  notes: string | null;
  tags: string[];
  review_status: ReviewStatus;
  reconciled: boolean;
  excluded_from_analytics: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetRecord {
  year_month: string;
  category: string;
  assigned: number | string;
  rollover: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalRecord {
  id: string;
  name: string;
  target_amount: number | string;
  current_amount: number | string;
  target_date: string | null;
  monthly_contribution: number | string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FutureEventRecord {
  id: string;
  title: string;
  expected_date: string;
  amount: number | string;
  category: string | null;
  account: string | null;
  recurrence: FutureEventRecurrence;
  recurrence_end: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScenarioRecord {
  id: string;
  name: string;
  income_change_pct: number | string;
  expense_change_pct: number | string;
  monthly_net_adjustment: number | string;
  monthly_savings_allocation: number | string;
  starting_balance_adjustment: number | string;
  horizon_months: number | string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrivateState {
  overrides: MovementOverride[];
  budgets: BudgetRecord[];
  goals: GoalRecord[];
  futureEvents: FutureEventRecord[];
  scenarios: ScenarioRecord[];
}

export async function privateDataRequest<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { status: 401, data: { ok: false, error: 'private-session-required' } as T };

  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');

  const response = await fetch(`${PRIVATE_DATA_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({ ok: false, error: 'invalid-private-data-response' }))) as T;
  return { status: response.status, data };
}

export const getPrivateState = cache(async (): Promise<PrivateState> => {
  const response = await privateDataRequest<{
    ok?: boolean;
    overrides?: MovementOverride[];
    budgets?: BudgetRecord[];
    goals?: GoalRecord[];
    futureEvents?: FutureEventRecord[];
    scenarios?: ScenarioRecord[];
    error?: string;
  }>('/state');
  if (response.status !== 200 || !response.data.ok) throw new Error(response.data.error || `private-data-${response.status}`);
  return {
    overrides: Array.isArray(response.data.overrides) ? response.data.overrides : [],
    budgets: Array.isArray(response.data.budgets) ? response.data.budgets : [],
    goals: Array.isArray(response.data.goals) ? response.data.goals : [],
    futureEvents: Array.isArray(response.data.futureEvents) ? response.data.futureEvents : [],
    scenarios: Array.isArray(response.data.scenarios) ? response.data.scenarios : [],
  };
});
