#!/usr/bin/env bash
set -euo pipefail

: "${AUD_VALIDATION_SHA:?AUD_VALIDATION_SHA is required for exact audit evidence}"
[[ "$(git rev-parse HEAD)" == "$AUD_VALIDATION_SHA" ]] || { echo 'AUD_E2E_DB|status=failed|reason=checkout_sha_mismatch'; exit 1; }
export GITHUB_SHA="$AUD_VALIDATION_SHA"

# This runner can only create its known disposable database on the CI service.
# Reject an inherited external URL before the baseline runner's first DROP.
AUD_ADMIN_URL='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
if [[ "${GITHUB_ACTIONS:-}" != 'true' || "${PRE001_POSTGRES_ADMIN_URL:-$AUD_ADMIN_URL}" != "$AUD_ADMIN_URL" ]]; then
  echo 'AUD_E2E_DB|status=failed|reason=disposable_ci_service_required'
  exit 1
fi
export PRE001_POSTGRES_ADMIN_URL="$AUD_ADMIN_URL"
source scripts/pre001-disposable-db-smoke.sh

# The older personal-backfill fixture intentionally has no inferred merchant.
# Give only its derived synthetic concept a recognizable shape before the later
# merchant migration's strict backfill check. Its bank source stays unchanged.
psql_db -c "UPDATE financial_app.transactions SET concept_normalized='COMPRA EN AUD Synthetic, CON LA TARJETA' WHERE id='${BASE_TRANSACTION_ID}';" >/dev/null

AUD_BATCH='20261007165000_qa_work_budget_snapshot_batch.sql'
AUD_BASELINE_END='20260909200000_pre001_function_surface_lockdown.sql'
aud_migration_count=0
while IFS= read -r migration; do
  base="$(basename "$migration")"
  if [[ "$base" > "$AUD_BASELINE_END" && "$base" != "$AUD_BATCH" ]]; then
    echo "AUD_E2E_DB|migration=${base}"
    psql_db -f "$migration" >/dev/null
    aud_migration_count=$((aud_migration_count + 1))
  fi
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort)

# Preserve the real previous implementation, including its permissions, so
# parity is checked against executable canonical SQL rather than copied formulas.
psql_db -c 'ALTER FUNCTION financial_app.budget_month_snapshot(text) RENAME TO aud_e2e_budget_month_snapshot_baseline;' >/dev/null
psql_db -f "supabase/migrations/${AUD_BATCH}" >/dev/null

psql_db -f supabase/tests/aud_e2e_budget_balance.sql
residue="$(psql_db -At -c "select count(*) from financial_app.workspaces where id in ('a0d00000-0000-4000-8000-000000000001','a0d00000-0000-4000-8000-000000000002');")"
[[ "$residue" == '0' ]] || { echo 'AUD_E2E_DB|status=failed|reason=fixture_rollback_failed'; exit 1; }
echo "AUD_E2E_DB|status=ok|migrations_after_pre001=${aud_migration_count}|fixtures_rolled_back=true|sha=${GITHUB_SHA}"
