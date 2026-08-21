import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../security/session';

const RULES_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-rules';

export type RuleMatchField = 'merchant' | 'concept' | 'merchant_or_concept';
export type RuleMatchMode = 'contains' | 'equals' | 'starts_with';
export type RuleDirection = 'any' | 'income' | 'expense';

export interface ClassificationRuleRecord {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  match_field: RuleMatchField;
  match_mode: RuleMatchMode;
  match_text: string;
  account_key: string | null;
  direction: RuleDirection;
  target_category: string | null;
  target_subcategory: string | null;
  target_merchant: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RulePreviewSample {
  sourceId: string;
  date: string;
  account: string;
  concept: string;
  sourceMerchant: string;
  sourceCategory: string;
  sourceSubcategory: string;
  amount: number | string | null;
  previewCategory: string;
  previewSubcategory: string;
  previewMerchant: string;
  wouldChange: boolean;
  manualProtected: boolean;
}

export interface RulePreview {
  ok: boolean;
  matched: number;
  wouldChange: number;
  manualProtected: number;
  samples: RulePreviewSample[];
}

export async function rulesRequest<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { status: 401, data: { ok: false, error: 'private-session-required' } as T };
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${RULES_URL}${path}`, { ...init, headers, cache: 'no-store' });
  const data = (await response.json().catch(() => ({ ok: false, error: 'invalid-rules-response' }))) as T;
  return { status: response.status, data };
}

export async function getClassificationRules(): Promise<ClassificationRuleRecord[]> {
  const response = await rulesRequest<{ ok?: boolean; rules?: ClassificationRuleRecord[]; error?: string }>('/rules');
  if (response.status !== 200 || !response.data.ok) throw new Error(response.data.error || `rules-${response.status}`);
  return Array.isArray(response.data.rules) ? response.data.rules : [];
}
