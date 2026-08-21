export type AuditCheckSeverity = 'ok' | 'warning' | 'error';

export interface AuditCheck {
  id: string;
  severity: AuditCheckSeverity;
  title: string;
  detail: string;
}

export interface AuditSnapshotInput {
  state: { ok: boolean; inSync: boolean; currentRows: number; normalizedRows: number; currentChecksum: string | null; normalizedChecksum: string | null };
  quality: { pending: number; duplicates: number; uncategorized: number };
}

export function buildSystemAuditChecks(input: AuditSnapshotInput): AuditCheck[] {
  const checks: AuditCheck[] = [];
  checks.push({ id: 'sync', severity: input.state.ok && input.state.inSync ? 'ok' : 'error', title: 'Sincronización normalizada', detail: input.state.inSync ? 'Snapshot y modelo normalizado están sincronizados.' : 'El modelo normalizado no coincide con el snapshot actual.' });
  checks.push({ id: 'rows', severity: input.state.currentRows === input.state.normalizedRows ? 'ok' : 'error', title: 'Número de movimientos', detail: `${input.state.currentRows.toLocaleString('es-ES')} en snapshot · ${input.state.normalizedRows.toLocaleString('es-ES')} normalizados.` });
  checks.push({ id: 'checksum', severity: Boolean(input.state.currentChecksum) && input.state.currentChecksum === input.state.normalizedChecksum ? 'ok' : 'error', title: 'Checksum de datos', detail: input.state.currentChecksum === input.state.normalizedChecksum ? 'La huella del snapshot coincide con la capa normalizada.' : 'La huella de datos no coincide.' });
  checks.push({ id: 'review', severity: input.quality.pending === 0 ? 'ok' : 'warning', title: 'Pendientes de revisión', detail: input.quality.pending === 0 ? 'No quedan movimientos pendientes.' : `${input.quality.pending.toLocaleString('es-ES')} movimientos siguen pendientes.` });
  checks.push({ id: 'duplicates', severity: input.quality.duplicates === 0 ? 'ok' : 'warning', title: 'Posibles duplicados', detail: input.quality.duplicates === 0 ? 'No hay grupos candidatos a duplicado.' : `${input.quality.duplicates.toLocaleString('es-ES')} grupos requieren decisión.` });
  checks.push({ id: 'uncategorized', severity: input.quality.uncategorized === 0 ? 'ok' : 'warning', title: 'Categorías', detail: input.quality.uncategorized === 0 ? 'Todos los movimientos efectivos tienen categoría.' : `${input.quality.uncategorized.toLocaleString('es-ES')} movimientos están sin categoría.` });
  return checks;
}

export function overallAuditSeverity(checks: AuditCheck[]): AuditCheckSeverity {
  if (checks.some((check) => check.severity === 'error')) return 'error';
  if (checks.some((check) => check.severity === 'warning')) return 'warning';
  return 'ok';
}
