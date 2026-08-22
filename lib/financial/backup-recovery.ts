export const BACKUP_MAX_BYTES = 10 * 1024 * 1024;
export const PRIVATE_BACKUP_RESTORE_CONFIRMATION = "RESTAURAR" as const;

export type BackupAction = "preview" | "restore";
export type BackupCommand = {
  action: BackupAction;
  backup: Record<string, unknown>;
  expectedFingerprint?: string;
  confirmation?: string;
};

const fingerprintPattern = /^[a-f0-9]{32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBackupCommand(value: unknown): BackupCommand | null {
  if (!isRecord(value)) return null;

  // Compatibilidad con 1.7: el cuerpo podía ser directamente la copia JSON.
  if (typeof value.format === "string" && !("backup" in value)) {
    return { action: "preview", backup: value };
  }

  if (value.action !== "preview" && value.action !== "restore") return null;
  if (!isRecord(value.backup)) return null;

  return {
    action: value.action,
    backup: value.backup,
    expectedFingerprint:
      typeof value.expectedFingerprint === "string"
        ? value.expectedFingerprint.trim().toLowerCase()
        : undefined,
    confirmation: typeof value.confirmation === "string" ? value.confirmation : undefined,
  };
}

export function canExecuteRestore(command: BackupCommand): boolean {
  return (
    command.action === "restore" &&
    command.confirmation === PRIVATE_BACKUP_RESTORE_CONFIRMATION &&
    typeof command.expectedFingerprint === "string" &&
    fingerprintPattern.test(command.expectedFingerprint)
  );
}
