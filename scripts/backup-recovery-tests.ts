import assert from "node:assert/strict";
import {
  PRIVATE_BACKUP_RESTORE_CONFIRMATION,
  canExecuteRestore,
  parseBackupCommand,
} from "../lib/financial/backup-recovery";

const backup = {
  format: "financial-app-private-backup",
  formatVersion: 2,
  sourceAnchors: [],
};

const raw = parseBackupCommand(backup);
assert.equal(raw?.action, "preview");
assert.equal(raw?.backup, backup);

const wrappedPreview = parseBackupCommand({ action: "preview", backup });
assert.equal(wrappedPreview?.action, "preview");

const restore = parseBackupCommand({
  action: "restore",
  backup,
  expectedFingerprint: "A".repeat(32),
  confirmation: PRIVATE_BACKUP_RESTORE_CONFIRMATION,
});
assert.ok(restore);
assert.equal(restore?.expectedFingerprint, "a".repeat(32));
assert.equal(canExecuteRestore(restore!), true);

const lowerCaseConfirmation = parseBackupCommand({
  action: "restore",
  backup,
  expectedFingerprint: "a".repeat(32),
  confirmation: "restaurar",
});
assert.equal(canExecuteRestore(lowerCaseConfirmation!), false);

const missingFingerprint = parseBackupCommand({
  action: "restore",
  backup,
  confirmation: PRIVATE_BACKUP_RESTORE_CONFIRMATION,
});
assert.equal(canExecuteRestore(missingFingerprint!), false);
assert.equal(parseBackupCommand({ action: "delete", backup }), null);
assert.equal(parseBackupCommand([]), null);

console.log("Financial App 1.8 backup command tests OK");
