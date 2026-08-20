import { findDuplicateCandidates, isTransfer } from './finance-engine';
import type { BankingSourceRow } from './source-schema';

export type QualityIssueType = 'duplicate' | 'review' | 'uncategorized' | 'unusual_amount';
export type QualitySeverity = 'high' | 'medium' | 'low';

export interface QualityIssue {
  id: string;
  type: QualityIssueType;
  severity: QualitySeverity;
  title: string;
  detail: string;
  sourceIds: string[];
}

function absoluteAmount(row: BankingSourceRow): number {
  return Math.abs(row.amount ?? 0);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function reviewFlag(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase('es-ES');
  return ['sí', 'si', 'yes', 'true', '1'].includes(normalized);
}

export function detectQualityIssues(rows: BankingSourceRow[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const group of findDuplicateCandidates(rows)) {
    const sourceIds = group.rows.map((row) => row.sourceId).filter(Boolean);
    if (sourceIds.length < 2) continue;
    const sample = group.rows[0];
    issues.push({
      id: `duplicate:${group.key}`,
      type: 'duplicate',
      severity: 'high',
      title: 'Posible movimiento duplicado',
      detail: `${group.rows.length} operaciones coinciden en fecha, cuenta, importe y concepto.`,
      sourceIds,
    });
  }

  for (const row of rows) {
    if (!row.sourceId) continue;
    if (reviewFlag(row.review)) {
      issues.push({
        id: `review:${row.sourceId}`,
        type: 'review',
        severity: 'medium',
        title: 'Movimiento pendiente de revisión',
        detail: 'La fuente lo ha marcado expresamente para comprobar.',
        sourceIds: [row.sourceId],
      });
    }
    if (!isTransfer(row) && !row.category.trim()) {
      issues.push({
        id: `uncategorized:${row.sourceId}`,
        type: 'uncategorized',
        severity: 'low',
        title: 'Movimiento sin categoría',
        detail: 'No se puede asignar correctamente a presupuesto o informe hasta categorizarlo.',
        sourceIds: [row.sourceId],
      });
    }
  }

  const byAccount = new Map<string, BankingSourceRow[]>();
  for (const row of rows) {
    if (!row.productOrAccount || row.amount === null || isTransfer(row)) continue;
    const group = byAccount.get(row.productOrAccount) ?? [];
    group.push(row);
    byAccount.set(row.productOrAccount, group);
  }

  for (const [account, accountRows] of byAccount) {
    const typical = median(accountRows.map(absoluteAmount).filter((value) => value > 0));
    if (accountRows.length < 8 || typical <= 0) continue;
    const threshold = Math.max(500, typical * 6);
    for (const row of accountRows) {
      const amount = absoluteAmount(row);
      if (amount < threshold || !row.sourceId) continue;
      issues.push({
        id: `unusual:${row.sourceId}`,
        type: 'unusual_amount',
        severity: amount >= threshold * 2 ? 'high' : 'medium',
        title: 'Importe poco habitual',
        detail: `El importe se aleja claramente del patrón habitual de ${account}.`,
        sourceIds: [row.sourceId],
      });
    }
  }

  const rank: Record<QualitySeverity, number> = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title, 'es'));
}
