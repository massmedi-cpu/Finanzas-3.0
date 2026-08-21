import { cookies } from 'next/headers';
import type { BankingSourceRow } from '../domain/source-schema';
import { SESSION_COOKIE } from '../security/session';

const BRIDGE_SOURCE_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-bridge/source';
const LOCAL_SOURCE_TTL_MS = 60_000;

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  sourceRows: number;
}

export interface GoogleSheetReadResult {
  range: string;
  rows: BankingSourceRow[];
}

type BridgeSourceResponse = {
  ok?: boolean;
  source?: {
    sheetName?: string;
    rowCount?: number;
  };
  rows?: BankingSourceRow[];
  error?: string;
};

type SourceCacheEntry = {
  token: string;
  expiresAt: number;
  value: GoogleSheetReadResult;
};

let sourceCache: SourceCacheEntry | null = null;
let sourceRequest: { token: string; promise: Promise<GoogleSheetReadResult> } | null = null;

export function isGoogleSheetsConfigured(): boolean {
  return true;
}

async function fetchSource(token: string): Promise<GoogleSheetReadResult> {
  const response = await fetch(BRIDGE_SOURCE_URL, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cache: 'no-store',
  });

  const data = (await response.json().catch(() => ({}))) as BridgeSourceResponse;
  if (!response.ok || !data.ok || !Array.isArray(data.rows)) {
    if (response.status === 401) throw new Error('private-session-expired');
    throw new Error(data.error || `source-bridge-${response.status}`);
  }

  const sheetName = data.source?.sheetName || 'Movimientos';
  return {
    range: `${sheetName}!A:V`,
    rows: data.rows,
  };
}

/**
 * Reads the protected source through the private bridge. The Google
 * credential never reaches Vercel or the browser and the master source
 * remains strictly read-only.
 *
 * The bridge already validates the 22-column source contract and stores a
 * current snapshot in Supabase. A short process-local cache prevents the
 * same ~2 MB snapshot from crossing the network again on every navigation.
 */
export async function readGoogleSheet(): Promise<GoogleSheetReadResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('private-session-required');

  const now = Date.now();
  if (sourceCache?.token === token && sourceCache.expiresAt > now) {
    return sourceCache.value;
  }

  if (sourceRequest?.token === token) return sourceRequest.promise;

  const promise = fetchSource(token)
    .then((value) => {
      sourceCache = { token, expiresAt: Date.now() + LOCAL_SOURCE_TTL_MS, value };
      return value;
    })
    .finally(() => {
      if (sourceRequest?.token === token) sourceRequest = null;
    });

  sourceRequest = { token, promise };
  return promise;
}

export async function syncGoogleSheets(): Promise<SyncResult> {
  const source = await readGoogleSheet();
  return {
    added: 0,
    updated: 0,
    removed: 0,
    sourceRows: source.rows.length,
  };
}
