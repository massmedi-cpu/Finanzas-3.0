import { cache } from 'react';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../security/session';

const SPLITS_DATA_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-splits';

export interface MovementSplitRecord {
  source_id: string;
  line_no: number;
  amount: number | string;
  category: string;
  subcategory: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function splitsDataRequest<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { status: 401, data: { ok: false, error: 'private-session-required' } as T };

  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');

  const response = await fetch(`${SPLITS_DATA_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({ ok: false, error: 'invalid-split-response' }))) as T;
  return { status: response.status, data };
}

export const getMovementSplits = cache(async (): Promise<MovementSplitRecord[]> => {
  const response = await splitsDataRequest<{ ok?: boolean; splits?: MovementSplitRecord[]; error?: string }>('/splits');
  if (response.status !== 200 || !response.data.ok) throw new Error(response.data.error || `split-data-${response.status}`);
  return Array.isArray(response.data.splits) ? response.data.splits : [];
});

export function indexMovementSplits(splits: MovementSplitRecord[]): Map<string, MovementSplitRecord[]> {
  const map = new Map<string, MovementSplitRecord[]>();
  for (const split of splits) {
    const list = map.get(split.source_id) ?? [];
    list.push(split);
    map.set(split.source_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => Number(a.line_no) - Number(b.line_no));
  return map;
}
