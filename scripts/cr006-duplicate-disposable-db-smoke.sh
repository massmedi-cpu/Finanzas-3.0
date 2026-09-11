#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required for exact CR-006 duplicate evidence}"
source scripts/pre020-disposable-db-smoke.sh

CR006_MIGRATION="supabase/migrations/20260911223000_cr006_duplicate_evidence_disambiguation.sql"
CR006_TEST="supabase/tests/cr006_duplicate_evidence_disambiguation.sql"

for file in "$CR006_MIGRATION" "$CR006_TEST"; do
  if [ ! -f "$file" ]; then
    echo "CR006_DUPLICATE_DB|status=failed|reason=missing_file|file=${file}"
    exit 1
  fi
done

echo "CR006_DUPLICATE_DB|migration=$(basename "$CR006_MIGRATION")"
psql_db -f "$CR006_MIGRATION" >/dev/null

output="$(psql_db -f "$CR006_TEST")"
printf '%s\n' "$output"
if ! grep -q 'CR006_DUPLICATE_EVIDENCE_DISAMBIGUATION_OK' <<<"$output"; then
  echo "CR006_DUPLICATE_DB|status=failed|reason=regression_marker_missing"
  exit 1
fi

helper_evidence="$(psql_db -At <<'SQL'
select concat_ws('|',
  p.prosecdef,
  p.provolatile,
  pg_catalog.has_function_privilege('financial_app_gateway',p.oid,'EXECUTE'),
  pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
  pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
  pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE'),
  (select count(*) from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl where acl.grantee=0 and acl.privilege_type='EXECUTE'))
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='financial_app' and p.proname='duplicate_candidate_group';
SQL
)"

[ "$helper_evidence" = "f|s|t|f|f|f|0" ] || {
  echo "CR006_DUPLICATE_DB|status=failed|reason=helper_privilege_contract|evidence=${helper_evidence}"
  exit 1
}

echo "CR006_DUPLICATE_DB|status=ok|smoke=balance_disambiguation+time_disambiguation+true_candidate_review+fail_closed_review+privilege_lockdown|helper=${helper_evidence}|sha=${GITHUB_SHA}"
