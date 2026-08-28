import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized, publicApiErrorCode } from "@/lib/api/response";
import { asRecord } from "@/lib/validation/json";

export const dynamic = "force-dynamic";
const MAX_BULK_MOVEMENTS = 200;

export async function POST(request: NextRequest) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();
  let body: unknown;
  try { body = await request.json(); } catch { return apiError("invalid_json"); }
  const input = asRecord(body);
  const action = String(input.action ?? "apply");

  if (action === "undo") {
    const batchId = typeof input.batchId === "string" && input.batchId.trim() ? input.batchId.trim() : null;
    const { data, error } = await supabase.rpc("financial_app_undo_bulk_transaction_batch", { p_batch_id:batchId });
    if (error || !data) {
      const publicCode=publicApiErrorCode(error,"bulk_undo_failed");
      return apiFailure("movements.bulk.undo",error,"bulk_undo_failed",publicCode==="changed_since_apply"?409:400);
    }
    return apiJson(data);
  }

  if (action !== "apply") return apiError("unsupported_action");
  const ids = Array.isArray(input.ids) ? [...new Set(input.ids.map(value => String(value ?? "").trim()).filter(Boolean))] : [];
  const patch = asRecord(input.patch);
  if (!ids.length) return apiError("no_transactions_selected");
  if (ids.length > MAX_BULK_MOVEMENTS) return apiError("bulk_limit_exceeded",400,{limit:MAX_BULK_MOVEMENTS});
  if (!Object.keys(patch).length) return apiError("invalid_patch");
  if (Object.keys(patch).some(key=>key.startsWith("$"))) return apiError("unsupported_bulk_operation");

  const { data, error } = await supabase.rpc("financial_app_bulk_update_transactions", {p_transaction_ids: ids,p_patch: patch});
  if (error || !data) return apiFailure("movements.bulk.apply",error,"bulk_update_failed");
  return apiJson(data);
}
