import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import test from 'node:test';

const shell=readFileSync('scripts/rec-ap8-restored-backup-rehearsal.sh','utf8');
const sql=readFileSync('supabase/tests/rec_ap8_restored_post_ddl_audit.sql','utf8');
const workflow=readFileSync('.github/workflows/aud-e2e-production-backup-preflight.yml','utf8');

test('rehearsal selects either old upgrade+rollback or current post-DDL checks',()=>{
  assert.match(shell,/case "\$baseline_guard" in/);
  assert.match(shell,/0\) fixture='supabase\/tests\/rec_ap8_restored_backup_upgrade_rollback\.sql'/);
  assert.match(shell,/1\)\s*fixture='supabase\/tests\/rec_ap8_restored_post_ddl_audit\.sql'/);
  assert.match(shell,/scripts\/rec-ap8-readiness-readonly\.sql/);
  assert.match(shell,/post_ddl_readiness_blocked/);
  assert.match(shell,/\[\[ "\$final_guard" == "\$baseline_guard" \]\]/);
  assert.match(shell,/upgrade_migrations=already_applied/);
  assert.doesNotMatch(shell,/supabase db push|supabase migration repair/);
});

test('post-DDL fixture is read only for all bank data and checks full month matrix',()=>{
  assert.match(sql,/BEGIN READ ONLY;/);
  assert.match(sql,/current_database\(\) <> 'financial_app_production_backup_restore_check'/);
  assert.match(sql,/financial_balance_series/);
  assert.match(sql,/financial_account_balances/);
  assert.match(sql,/checked_points=384/);
  assert.match(sql,/documents_private_original_rewrite_guard/);
  assert.match(sql,/source_record_id/);
  assert.doesNotMatch(sql,/\\i\s+supabase\/migrations/);
  const executable=sql.split('\n').filter(x=>!x.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(executable,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE|COPY)\b/i);
  assert.match(sql,/COMMIT;\s*$/);
});

test('CI workflow triggers new audit and runs the safety gate',()=>{
  assert.match(workflow,/supabase\/tests\/rec_ap8_restored_post_ddl_audit\.sql/);
  assert.match(workflow,/tests\/unit\/ap8-post-ddl-mode\.test\.mjs/);
  assert.match(workflow,/node --test tests\/unit\/ap8-post-ddl-mode\.test\.mjs/);
});

// REC-AP8-643: the fresh encrypted 10.0.103 backup is now a 3,218-row
// post-import snapshot. The exact number is a release invariant, not a
// substitute for RLS, guarded original files, workspace isolation, digests,
// or rollback. A later authorized import must recertify this expectation.
test('post-import 3218-row backup baseline is pinned consistently across isolated AP8 gates',()=>{
  const expected='ready|{}|6|32|32|1|1|1|0|3218|3218|0|0';
  assert.ok(shell.includes(expected), 'readiness must match the 3218-row verified backup');
  assert.equal((sql.match(/<>3218/g) ?? []).length,4,
    'audit must check both bank tables before and after synthetic rollback');
  const acl=readFileSync('supabase/tests/rec_ap8_restored_post_ddl_gateway_acl.sql','utf8');
  assert.equal((acl.match(/<>3218/g) ?? []).length,2,
    'ACL reconstruction must require the same post-import source and transactions');
  for (const content of [shell,sql,acl]) {
    assert.doesNotMatch(content,/\b3188\b/,'no obsolete source-count gate may remain');
  }
  assert.match(sql,/original_digests_preserved=true/);
  assert.match(sql,/REC_AP8_POST_DDL_SYNTHETIC_RESIDUE_OR_DATA_DRIFT/);
  assert.match(shell,/post_ddl_readiness_blocked/);
});
