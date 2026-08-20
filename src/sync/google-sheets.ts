import { cookies } from 'next/headers';
import { SOURCE_COLUMNS, type BankingSourceRow } from '../domain/source-schema';
import { SESSION_COOKIE } from '../security/session';

const BRIDGE_SOURCE_URL = 'https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-v3-bridge/source';

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  sourceRows: number;
}

export interface GoogleSheetReadResult {
  range: string;
  values: unknown[][];
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

export function isGoogleSheetsConfigured(): boolean {
  return true;
}

function toSourceValues(row: BankingSourceRow): unknown[] {
  return [
    row.sourceId,
    row.date,
    row.time,
    row.productOrAccount,
    row.institution,
    row.identifier,
    row.productType,
    row.movementType,
    row.category,
    row.subcategory,
    row.originalConcept,
    row.normalizedConcept,
    row.merchantOrCounterparty,
    row.amount,
    row.balance,
    row.channel,
    row.originAccount,
    row.destinationAccount,
    row.reconciled,
    row.review,
    row.notes,
    row.source,
  ];
}

/**
 * Reads the protected source through the private bridge. The Google
 * credential never reaches Vercel or the browser and the master source
 * remains strictly read-only.
 */
export async function readGoogleSheet(): Promise<GoogleSheetReadResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('private-session-required');

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
    values: [SOURCE_COLUMNS as unknown as string[], ...data.rows.map(toSourceValues)],
  };
}

export async function syncGoogleSheets(): Promise<SyncResult> {
  const source = await readGoogleSheet();
  return {
    added: 0,
    updated: 0,
    removed: 0,
    sourceRows: Math.max(0, source.values.length - 1),
  };
}
