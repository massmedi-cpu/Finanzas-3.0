#!/usr/bin/env bash
set -euo pipefail

[[ -n "$AUD_VALIDATION_SHA" ]] || {
  echo 'CAPACITY_DB|status=failed|reason=sha_missing'; exit 1;
}
[[ "$(git rev-parse HEAD)" == "$AUD_VALIDATION_SHA" ]] || {
  echo 'CAPACITY_DB|status=failed|reason=exact_sha_mismatch'; exit 1;
}
export GITHUB_SHA="$AUD_VALIDATION_SHA"

# Hard fail before sourcing scripts which CREATE/DROP databases unless this
# is our disposable PostgreSQL service inside GitHub Actions.
LOCAL_ADMIN='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
if [[ "$GITHUB_ACTIONS" != "true" ]]; then
  echo 'CAPACITY_DB|status=failed|reason=disposable_ci_postgres_only'; exit 1;
fi
# Override inherited credentials: never allow an external database URL.
export PRE001_POSTGRES_ADMIN_URL="$LOCAL_ADMIN"
source scripts/pre001-disposable-db-smoke.sh

# Preserve the safe migration sequence used by existing disposable CI.
# Only the synthetic PRE001 concept is adjusted for the merchant backfill.
psql_db -c "UPDATE financial_app.transactions SET concept_normalized='COMPRA EN AUD Synthetic, CON LA TARJETA' WHERE id='$BASE_TRANSACTION_ID';" >/dev/null
BASELINE_END='20260909200000_pre001_function_surface_lockdown.sql'
count=0
while IFS= read -r migration; do
  name="$(basename "$migration")"
  if [[ "$name" > "$BASELINE_END" ]]; then
    echo "CAPACITY_DB|migration=$name"
    psql_db -f "$migration" >/dev/null
    count=$((count + 1))
  fi
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort)

# AP1/AP2 persistence: first psql connection COMMITS fictional budgets; the
# next separate connection verifies durable readback and RLS isolation.
# The entire database is CI-local and removed by PRE001's exit trap.
psql_db -f supabase/tests/financial_persistence_ap1_ap2_seed_disposable.sql >/dev/null
psql_db -f supabase/tests/financial_persistence_ap1_ap2_readback_disposable.sql
# A third connection edits/clears, and a fourth READ ONLY connection
# proves those changes survive COMMIT without touching the other tenant.
psql_db -f supabase/tests/financial_persistence_ap1_ap2_mutate_disposable.sql >/dev/null
psql_db -f supabase/tests/financial_persistence_ap1_ap2_final_readback_disposable.sql

# BEGIN/ROLLBACK live in SQL. This uses PostgreSQL, not a mocked gateway.
psql_db -f supabase/tests/financial_performance_50k_disposable.sql

leftover="$(psql_db -At -c "SELECT count(*) FROM financial_app.workspaces WHERE id='a0f00000-0000-4000-8000-000000000001';")"
[[ "$leftover" == 0 ]] || {
  echo 'CAPACITY_DB|status=failed|reason=fixture_not_rolled_back'; exit 1;
}
echo "CAPACITY_DB|status=ok|fixture_rolled_back=true|migrations=$count|sha=$AUD_VALIDATION_SHA"
