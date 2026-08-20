import { cache } from 'react';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../security/session';

const RECURRING_DATA_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-recurring';

export type RecurringPreferenceStatus = 'auto' | 'confirmed' | 'ignored';

export interface RecurringPreferenceRecord {
  pattern_key: string;
  status: RecurringPreferenceStatus;
  display_name: string | null;
  expected_amount: number | string | null;
  category: string | null;
  next_expected_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function recurringDataRequest<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { status: 401, data: { ok: false, error: 'private-session-required' } as T };

  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');

  const response = await fetch(`${RECURRING_DATA_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({ ok: false, error: 'invalid-recurring-response' }))) as T;
  return { status: response.status, data };
}

export const getRecurringPreferences = cache(async (): Promise<RecurringPreferenceRecord[]> => {
  const response = await recurringDataRequest<{ ok?: boolean; preferences?: RecurringPreferenceRecord[]; error?: string }>('/preferences');
  if (response.status !== 200 || !response.data.ok) throw new Error(response.data.error || `recurring-data-${response.status}`);
  return Array.isArray(response.data.preferences) ? response.data.preferences : [];
});
