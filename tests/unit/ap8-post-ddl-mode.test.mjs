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
