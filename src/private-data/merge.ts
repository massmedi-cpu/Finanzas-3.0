import type { BankingSourceRow } from '../domain/source-schema';
import type { MovementOverride, ReviewStatus } from './client';

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
