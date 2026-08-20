import { findDuplicateCandidates, getLatestAccountBalances, getMonthlySummary } from '../domain/finance-engine';
import { parseSourceRow, validateSourceHeader, type BankingSourceRow } from '../domain/source-schema';
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

export async function loadValidatedSource(): Promise<SourcePreview> {
  const source = await readGoogleSheet();
  const [header, ...dataRows] = source.values;

  if (!header || !validateSourceHeader(header)) {
    throw new Error('The banking source schema does not match the expected 22-column contract');
  }

  const rows = dataRows
    .map(parseSourceRow)
    .filter((row) => row.sourceId || row.date || row.originalConcept || row.amount !== null);

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
}
