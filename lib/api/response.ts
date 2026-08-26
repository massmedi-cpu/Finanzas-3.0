import { NextResponse } from "next/server";

export const API_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export function apiJson<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: API_NO_STORE_HEADERS });
}

export function apiError(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return apiJson({ ok: false, error, ...extra }, status);
}

export function apiUnauthorized() {
  return apiError("unauthorized", 401);
}

const PUBLIC_EXACT = new Set([
  "forbidden",
  "unauthorized",
  "invalid_patch",
  "transaction_not_found",
  "no_transactions_selected",
  "bulk_limit_exceeded",
  "batch_not_found",
  "batch_already_undone",
  "changed_since_open",
  "candidate_changed_since_open",
  "reconciliation_reason_required",
  "reconciliation_reason_too_long",
  "invalid_reconciliation_decision",
  "invalid_reconciliation_status",
  "same_transaction",
  "same_source_product",
  "amounts_do_not_offset",
  "dates_too_far_apart",
  "pair_requires_internal_transfers",
  "pair_already_reconciled",
  "invalid_source_state",
  "transaction_a_not_found",
  "transaction_b_not_found",
]);

const PUBLIC_PREFIXES = [
  "field_not_editable",
  "changed_since_apply",
  "backup_not_safe",
] as const;

function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { message?: unknown };
  return typeof candidate.message === "string" ? candidate.message.trim() : "";
}

export function publicApiErrorCode(error: unknown, fallback: string) {
  const raw = databaseErrorCode(error);
  if (PUBLIC_EXACT.has(raw)) return raw;
  for (const prefix of PUBLIC_PREFIXES) {
    if (raw === prefix || raw.startsWith(`${prefix}:`) || raw.startsWith(`${prefix} `)) return prefix;
  }
  return fallback;
}

export function apiFailure(context: string, error: unknown, fallback: string, status = 400) {
  const publicCode = publicApiErrorCode(error, fallback);
  const internal = error && typeof error === "object"
    ? error as { code?: unknown; name?: unknown }
    : null;
  console.error("financial_app_api_failure", {
    context,
    publicCode,
    code: typeof internal?.code === "string" ? internal.code : undefined,
    name: typeof internal?.name === "string" ? internal.name : undefined,
  });
  return apiError(publicCode, status);
}
