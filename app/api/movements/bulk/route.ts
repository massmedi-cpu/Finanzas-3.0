import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized, publicApiErrorCode } from "@/lib/api/response";
import { asRecord } from "@/lib/validation/json";

export const dynamic = "force-dynamic";
const MAX_BULK_MOVEMENTS = 200;
const MAX_BULK_TAGS = 20;
const MAX_TAG_LENGTH = 48;

function validateTagOperation(patch:Record<string,unknown>){
  const specialKeys=Object.keys(patch).filter(key=>key.startsWith("$"));
  if(specialKeys.some(key=>key!=="$tags"))return "unsupported_bulk_operation";
  if(!("$tags" in patch))return null;
  if("tags" in patch)return "conflicting_tag_operations";
  const operation=asRecord(patch.$tags);
  const mode=String(operation.mode??"").trim().toLowerCase();
  const values=Array.isArray(operation.values)?[...new Set(operation.values.map(value=>String(value??"").trim()).filter(Boolean))]:[];
  if(mode!=="add"&&mode!=="remove")return "invalid_tag_operation";
  if(!values.length||values.length>MAX_BULK_TAGS||values.some(value=>value.length>MAX_TAG_LENGTH))return "invalid_tag_operation";
  return null;
}

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
  const tagOperationError=validateTagOperation(patch);
  if(tagOperationError)return apiError(tagOperationError);

  const { data, error } = await supabase.rpc("financial_app_bulk_update_transactions", {p_transaction_ids: ids,p_patch: patch});
  if (error || !data) return apiFailure("movements.bulk.apply",error,"bulk_update_failed");
  return apiJson(data);
}
