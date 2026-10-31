#!/usr/bin/env bash
set -euo pipefail
umask 077

# REC-REL-461: disposable PostgreSQL 17 only, zero bank/Drive/private data.
# This is a synthetic 10.0.103-compatible schema and CANNOT certify a
# migration applied to an authentic production 10.0.103 backup.
local_admin='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
if [[ "${GITHUB_ACTIONS:-}" != true
   || ! "${AUD_VALIDATION_SHA:-}" =~ ^[0-9a-f]{40}$
   || "$(git rev-parse HEAD)" != "${AUD_VALIDATION_SHA:-}"
   || "${PRE001_POSTGRES_ADMIN_URL:-$local_admin}" != "$local_admin" ]]; then
  echo 'REC_AP8_DELTA|status=failed|reason=isolated_exact_sha_ci_only'
  exit 1
fi
for forbidden in FINANCIAL_APP_DB_URL FINANCIAL_APP_DB_PASSWORD SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY SUPABASE_ACCESS_TOKEN; do
  [[ -z "${!forbidden:-}" ]] || {
    echo 'REC_AP8_DELTA|status=failed|reason=external_credentials_forbidden'
    exit 1
  }
done
export GITHUB_SHA="$AUD_VALIDATION_SHA"
export PRE001_POSTGRES_ADMIN_URL="$local_admin"

# PRE001 guards the loopback URL, creates the throwaway database, seeds a
# synthetic source row, and unconditionally removes the database on exit.
source scripts/pre001-disposable-db-smoke.sh
psql_db -c "UPDATE financial_app.transactions SET concept_normalized='COMPRA EN AUD Synthetic, CON LA TARJETA' WHERE id='$BASE_TRANSACTION_ID';" >/dev/null

baseline_end='20260909200000_pre001_function_surface_lockdown.sql'
first_delta='20261011205000_ap1_private_document_original_immutable.sql'
count=0
while IFS= read -r migration; do
  name="$(basename "$migration")"
  if [[ "$name" > "$baseline_end" && "$name" < "$first_delta" ]]; then
    psql_db -f "$migration" >/dev/null
    count=$((count+1))
  fi
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort)

if (( count < 20 )); then
  echo "REC_AP8_DELTA|status=failed|reason=incomplete_baseline|migrations=$count"
  exit 1
fi
echo "REC_AP8_DELTA|phase=baseline|synthetic_migrations=$count|sha=$AUD_VALIDATION_SHA"

# Single psql session retains temporary baseline catalogs across explicit
# BEGIN/COMMIT in migration files; the final rollback restores routines,
# policies and AP1 trigger in this disposable database before the exit trap.
psql_db -f supabase/tests/rec_ap8_delta_upgrade_rollback_disposable.sql

# Under no condition use this result as evidence of authentic production
# backup restore or of 2-user cloud G5 OCR acceptance.
echo "REC_AP8_DELTA|status=ok|mode=disposable_only|baseline=synthetic_10_0_103_compatible|deltas=5|production_writes=false|sha=$AUD_VALIDATION_SHA"
