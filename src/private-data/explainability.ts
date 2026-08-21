import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../security/session';

const EXPLAINABILITY_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-explainability';

export interface RuleSuggestionSample {
  sourceId: string;
  date: string;
  amount: number | string;
}

export interface RuleSuggestion {
  id: string;
  merchant: string;
  matchField: 'merchant';
  matchMode: 'equals';
  matchText: string;
  direction: 'any' | 'income' | 'expense';
  targetCategory: string;
  targetSubcategory: string | null;
  targetMerchant: string;
  matched: number;
  confidence: number;
  samples: RuleSuggestionSample[];
}

export async function getRuleSuggestions(limit = 20): Promise<RuleSuggestion[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('private-session-required');
  const response = await fetch(`${EXPLAINABILITY_URL}/suggestions?limit=${Math.max(1, Math.min(limit, 50))}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({ ok: false, error: 'invalid-explainability-response' }))) as { ok?: boolean; suggestions?: RuleSuggestion[]; error?: string };
  if (!response.ok || !data.ok) throw new Error(data.error || `explainability-${response.status}`);
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}
