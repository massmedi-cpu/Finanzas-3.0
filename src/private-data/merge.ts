import type { BankingSourceRow } from '../domain/source-schema';
import type { MovementOverride, ReviewStatus } from './client';
import type { MovementSplitRecord } from './splits';

function normalizedFlag(value: string): string {
  return value.trim().toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function sourceBoolean(value: string): boolean {
  return ['si', 'yes', 'true', '1', 'conciliado'].includes(normalizedFlag(value));
}

export function sourceReviewStatus(value: string): ReviewStatus {
  const normalized = normalizedFlag(value);
  return ['si', 'yes', 'true', '1', 'revisar', 'pendiente'].includes(normalized) ? 'pending' : 'reviewed';
}

export function indexOverrides(overrides: MovementOverride[]): Map<string, MovementOverride> {
  return new Map(overrides.map((override) => [override.source_id, override]));
}

export function applyOverride(row: BankingSourceRow, override?: MovementOverride): BankingSourceRow {
  if (!override) return row;
  return {
    ...row,
    category: override.category || row.category,
    subcategory: override.subcategory || row.subcategory,
    merchantOrCounterparty: override.merchant || row.merchantOrCounterparty,
    notes: override.notes ?? row.notes,
    reconciled: override.reconciled ? 'Sí' : 'No',
    review: override.review_status === 'pending' ? 'Sí' : 'No',
  };
}

export function rowsForAnalytics(rows: BankingSourceRow[], overrides: MovementOverride[]): BankingSourceRow[] {
  const byId = indexOverrides(overrides);
  return rows
    .filter((row) => !byId.get(row.sourceId)?.excluded_from_analytics)
    .map((row) => applyOverride(row, byId.get(row.sourceId)));
}

export function rowsForBudgetAndReports(
  rows: BankingSourceRow[],
  overrides: MovementOverride[],
  splits: MovementSplitRecord[],
): BankingSourceRow[] {
  const baseRows = rowsForAnalytics(rows, overrides);
  const bySource = new Map<string, MovementSplitRecord[]>();

  for (const split of splits) {
    const list = bySource.get(split.source_id) ?? [];
    list.push(split);
    bySource.set(split.source_id, list);
  }

  return baseRows.flatMap((row) => {
    const lines = bySource.get(row.sourceId);
    if (!lines || lines.length < 2) return [row];

    return [...lines]
      .sort((a, b) => Number(a.line_no) - Number(b.line_no))
      .map((line) => ({
        ...row,
        sourceId: `${row.sourceId}::split:${line.line_no}`,
        amount: Number(line.amount),
        balance: null,
        category: line.category,
        subcategory: line.subcategory || '',
        notes: line.notes || row.notes,
      }));
  });
}

export function baseSourceId(sourceId: string): string {
  const marker = '::split:';
  const index = sourceId.indexOf(marker);
  return index >= 0 ? sourceId.slice(0, index) : sourceId;
}
