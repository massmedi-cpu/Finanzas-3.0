import assert from 'node:assert/strict';
import { PRIVATE_BACKUP_FORMAT, PRIVATE_BACKUP_SCHEMA_VERSION, PRIVATE_BACKUP_RESTORE_CONFIRMATION, assessPortableBackupEnvelope, hasExplicitRestoreConfirmation } from '../src/domain/private-backup-engine.ts';

const checksum = 'abc123';
const compatible = assessPortableBackupEnvelope({ format: PRIVATE_BACKUP_FORMAT, schemaVersion: PRIVATE_BACKUP_SCHEMA_VERSION, sourceChecksum: checksum, sourceRows: 3135, tables: {} }, checksum, 3135);
assert.equal(compatible.safeEnvelope, true);
assert.equal(assessPortableBackupEnvelope({ format: PRIVATE_BACKUP_FORMAT, schemaVersion: PRIVATE_BACKUP_SCHEMA_VERSION, sourceChecksum: 'other', sourceRows: 3135, tables: {} }, checksum, 3135).safeEnvelope, false);
assert.equal(assessPortableBackupEnvelope({ format: PRIVATE_BACKUP_FORMAT, schemaVersion: 2, sourceChecksum: checksum, sourceRows: 3135, tables: {} }, checksum, 3135).schemaCompatible, false);
assert.equal(assessPortableBackupEnvelope({ format: PRIVATE_BACKUP_FORMAT, schemaVersion: PRIVATE_BACKUP_SCHEMA_VERSION, sourceChecksum: checksum, sourceRows: 3134, tables: {} }, checksum, 3135).rowCountCompatible, false);
assert.equal(hasExplicitRestoreConfirmation(PRIVATE_BACKUP_RESTORE_CONFIRMATION), true);
assert.equal(hasExplicitRestoreConfirmation('restaurar'), false);
console.log('Backup portability regression tests: OK');
