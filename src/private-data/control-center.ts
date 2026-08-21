import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../security/session';

const CONTROL_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-control';

export interface SystemSnapshot {
  ok: boolean;
  status: 'ok' | 'warning' | 'error';
  capturedAt: string;
  state: { ok: boolean; inSync: boolean; currentRows: number; normalizedRows: number; currentChecksum: string | null; normalizedChecksum: string | null; minDate: string | null; maxDate: string | null; sourceModifiedAt: string | null; lastNormalizedAt: string | null; snapshotSyncedAt: string | null };
  quality: { ok: boolean; pending: number; duplicates: number; uncategorized: number };
  automation: { activeRules: number; totalRules: number; suggestions: number };
  privateLayer: { overrides: number; splitMovements: number; closedMonths: number; openMonths: number; activeGoals: number; budgetRows: number; activeFutureEvents: number; activeScenarios: number };
}

export interface SystemAuditRecord {
  id: string;
  captured_at: string;
  status: 'ok' | 'warning' | 'error';
  source_checksum: string | null;
  current_rows: number;
  normalized_rows: number;
  snapshot: SystemSnapshot;
  note: string | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('private-session-required');
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${CONTROL_URL}${path}`, { ...init, headers, cache: 'no-store' });
  const data = (await response.json().catch(() => ({ ok: false, error: 'invalid-control-response' }))) as T & { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) throw new Error(data.error || `control-${response.status}`);
  return data;
}

export function getSystemSnapshot() { return request<SystemSnapshot>('/snapshot'); }
export async function getSystemAuditHistory() {
  const data = await request<{ ok: boolean; audits: SystemAuditRecord[] }>('/history');
  return Array.isArray(data.audits) ? data.audits : [];
}
export async function captureSystemAudit(note?: string) {
  const data = await request<{ ok: boolean; audit: SystemAuditRecord }>('/capture', { method: 'POST', body: JSON.stringify({ note: note || null }) });
  return data.audit;
}
