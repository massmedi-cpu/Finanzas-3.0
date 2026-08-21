import { cache } from 'react';
import { findDuplicateCandidates, getLatestAccountBalances, getMonthlySummary } from '../domain/finance-engine';
import type { BankingSourceRow } from '../domain/source-schema';
import { readGoogleSheet } from './google-sheets';

export interface SourcePreview {
  range: string;
  rows: BankingSourceRow[];
  duplicateGroups: number;
  accounts: number;
  needsReview: number;
  latestMonth: string | null;
  latestMonthSummary: ReturnType<typeof getMonthlySummary> | null;
}

export const loadValidatedSource = cache(async (): Promise<SourcePreview> => {
  const source = await readGoogleSheet();

  // The bridge already validates the canonical 22-column header before a
  // snapshot can become current. Keep the structured rows as-is instead of
  // converting 3k+ rows to 22-column arrays and parsing them back again.
  const rows = source.rows.filter((row) => row.sourceId || row.date || row.originalConcept || row.amount !== null);

  const duplicateGroups = findDuplicateCandidates(rows).length;
  const accounts = getLatestAccountBalances(rows).length;
  const needsReview = rows.filter((row) => {
    const value = row.review.trim().toLocaleLowerCase('es-ES');
    return value === 'sí' || value === 'si';
  }).length;

  const latestDate = rows.reduce<string>((latest, row) => (row.date > latest ? row.date : latest), '');
  const latestMonth = latestDate ? latestDate.slice(0, 7) : null;

  return {
    range: source.range,
    rows,
    duplicateGroups,
    accounts,
    needsReview,
    latestMonth,
    latestMonthSummary: latestMonth ? getMonthlySummary(rows, latestMonth) : null,
  };
});
