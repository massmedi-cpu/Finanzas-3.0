export const PRIVATE_BACKUP_FORMAT = 'finanzas-private-backup' as const;
export const PRIVATE_BACKUP_SCHEMA_VERSION = 1 as const;
export const PRIVATE_BACKUP_RESTORE_CONFIRMATION = 'RESTAURAR' as const;

export interface PortableBackupEnvelope {
  format?: unknown;
  schemaVersion?: unknown;
  sourceChecksum?: unknown;
  sourceRows?: unknown;
  tables?: unknown;
}

export interface PortableBackupCompatibility {
  formatCompatible: boolean;
  schemaCompatible: boolean;
  checksumCompatible: boolean;
  rowCountCompatible: boolean;
  hasTablePayload: boolean;
  safeEnvelope: boolean;
}

export function assessPortableBackupEnvelope(
  backup: PortableBackupEnvelope | null | undefined,
  currentChecksum: string,
  currentRows: number,
): PortableBackupCompatibility {
  const formatCompatible = backup?.format === PRIVATE_BACKUP_FORMAT;
  const schemaCompatible = Number(backup?.schemaVersion) === PRIVATE_BACKUP_SCHEMA_VERSION;
  const checksumCompatible = typeof backup?.sourceChecksum === 'string' && backup.sourceChecksum === currentChecksum;
  const rowCountCompatible = Number(backup?.sourceRows) === currentRows;
  const hasTablePayload = Boolean(backup?.tables && typeof backup.tables === 'object' && !Array.isArray(backup.tables));
  return {
    formatCompatible,
    schemaCompatible,
    checksumCompatible,
    rowCountCompatible,
    hasTablePayload,
    safeEnvelope: formatCompatible && schemaCompatible && checksumCompatible && rowCountCompatible && hasTablePayload,
  };
}

export function hasExplicitRestoreConfirmation(value: unknown) {
  return value === PRIVATE_BACKUP_RESTORE_CONFIRMATION;
}
