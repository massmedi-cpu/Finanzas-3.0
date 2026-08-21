import assert from 'node:assert/strict';
import { buildSystemAuditChecks, overallAuditSeverity } from '../src/domain/system-audit-engine.ts';

const healthy = buildSystemAuditChecks({ state: { ok: true, inSync: true, currentRows: 3135, normalizedRows: 3135, currentChecksum: 'abc', normalizedChecksum: 'abc' }, quality: { pending: 0, duplicates: 0, uncategorized: 0 } });
assert.equal(overallAuditSeverity(healthy), 'ok');

const warnings = buildSystemAuditChecks({ state: { ok: true, inSync: true, currentRows: 3135, normalizedRows: 3135, currentChecksum: 'abc', normalizedChecksum: 'abc' }, quality: { pending: 3, duplicates: 2, uncategorized: 0 } });
assert.equal(overallAuditSeverity(warnings), 'warning');
assert.equal(warnings.filter((item) => item.severity === 'warning').length, 2);

const broken = buildSystemAuditChecks({ state: { ok: true, inSync: false, currentRows: 3135, normalizedRows: 3134, currentChecksum: 'abc', normalizedChecksum: 'def' }, quality: { pending: 0, duplicates: 0, uncategorized: 0 } });
assert.equal(overallAuditSeverity(broken), 'error');
assert.equal(broken.filter((item) => item.severity === 'error').length, 3);

console.log('System audit regression tests: OK');
