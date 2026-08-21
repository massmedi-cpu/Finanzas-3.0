import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../security/session';

const NORMALIZED_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-normalized';

export type NormalizedReviewMode = 'all' | 'review' | 'ok';

export interface NormalizedAccountOption {
  accountKey: string;
  name: string;
  institution: string;
  type: string;
  balance: number | string | null;
  balanceDate: string | null;
}

export interface NormalizedState {
  ok: boolean;
  inSync: boolean;
  currentChecksum: string | null;
  normalizedChecksum: string | null;
  currentRows: number;
  normalizedRows: number;
  minDate: string | null;
  maxDate: string | null;
  lastNormalizedAt: string | null;
  sourceModifiedAt: string | null;
  snapshotSyncedAt: string | null;
  accounts: NormalizedAccountOption[];
}

export interface NormalizedMovementSplit {
  lineNo: number;
  amount: number | string;
  category: string;
  subcategory: string;
  notes: string;
}

export interface NormalizedMovement {
  transactionId: string;
  id: string;
  date: string;
  account: string;
  accountKey: string;
  institution: string;
  accountType: string;
  type: string;
  sourceCategory: string;
  category: string;
  sourceSubcategory: string;
  subcategory: string;
  concept: string;
  sourceMerchant: string;
  merchant: string;
  amount: number | string | null;
  balance: number | string | null;
  channel: string;
  reviewStatus: 'pending' | 'reviewed' | 'ignored';
  sourceReviewStatus: 'pending' | 'reviewed' | 'ignored';
  reconciled: boolean;
  sourceReconciled: boolean;
  excludedFromAnalytics: boolean;
  notes: string;
  hasOverride: boolean;
  splits: NormalizedMovementSplit[];
  cursorPosition: number;
}

export interface NormalizedCursor {
  date: string;
  position: number;
  id: string;
}

export interface NormalizedMovementsPage {
  ok: boolean;
  items: NormalizedMovement[];
  total: number | null;
  hasMore: boolean;
  nextCursor: NormalizedCursor | null;
}

export interface NormalizedBootstrap {
  ok: boolean;
  state: NormalizedState;
  page: NormalizedMovementsPage;
}

export interface NormalizedMovementQuery {
  limit?: number;
  cursor?: NormalizedCursor | null;
  month?: string;
  accountKey?: string;
  q?: string;
  status?: NormalizedReviewMode;
  includeTotal?: boolean;
}

function appendQuery(params: URLSearchParams, query: NormalizedMovementQuery) {
  params.set('limit', String(Math.max(1, Math.min(query.limit ?? 100, 200))));
  if (query.cursor) {
    params.set('cursorDate', query.cursor.date);
    params.set('cursorPosition', String(query.cursor.position));
    params.set('cursorId', query.cursor.id);
  }
  if (query.month) params.set('month', query.month);
  if (query.accountKey) params.set('accountKey', query.accountKey);
  if (query.q) params.set('q', query.q);
  if (query.status && query.status !== 'all') params.set('status', query.status);
  if (query.includeTotal === false) params.set('includeTotal', '0');
}

async function normalizedRequest<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('private-session-required');

  const response = await fetch(`${NORMALIZED_URL}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({ ok: false, error: 'invalid-normalized-response' }))) as T & { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) throw new Error(data.error || `normalized-${response.status}`);
  return data;
}

export async function getNormalizedBootstrap(limit = 100): Promise<NormalizedBootstrap> {
  const params = new URLSearchParams();
  appendQuery(params, { limit, includeTotal: true });
  return normalizedRequest<NormalizedBootstrap>(`/bootstrap?${params.toString()}`);
}

export async function getNormalizedMovementsPage(query: NormalizedMovementQuery = {}): Promise<NormalizedMovementsPage> {
  const params = new URLSearchParams();
  appendQuery(params, query);
  return normalizedRequest<NormalizedMovementsPage>(`/transactions?${params.toString()}`);
}
