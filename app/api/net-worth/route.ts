import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import { normalizeNetWorth } from "@/lib/financial/net-worth";
import { validCalendarDate } from "@/lib/time/calendar-date";
import { asBoolean, asNumber, asRecord, asString, nullableString } from "@/lib/validation/json";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await getAuthorizedClient();if (!supabase) return apiUnauthorized();
  const requested = Number(request.nextUrl.searchParams.get("months") || 18);
  const months = Number.isFinite(requested) ? Math.max(6, Math.min(60, Math.trunc(requested))) : 18;
  const { data, error } = await supabase.rpc("financial_app_net_worth_overview", { p_months: months });
  if (error || !data) return apiFailure("net_worth.overview", error, "net_worth_unavailable");
  return apiJson(normalizeNetWorth(data));
}

export async function POST(request: NextRequest) {
  const supabase = await getAuthorizedClient();if (!supabase) return apiUnauthorized();
  let body: unknown;try { body = await request.json(); } catch { return apiError("invalid_json"); }
  const input=asRecord(body);const value=asNumber(input.value,Number.NaN);const type=asString(input.itemType);const itemType=type==="liability"?"liability":type==="asset"?"asset":null;
  const valuationDate=validCalendarDate(input.valuationDate);
  const name=asString(input.name).trim();
  if (!name || !itemType || !Number.isFinite(value) || value < 0 || !valuationDate) return apiError("invalid_item");
  const { error } = await supabase.rpc("financial_app_upsert_net_worth_item", {p_id:nullableString(input.id),p_name:name,p_item_type:itemType,p_category:nullableString(input.category),p_value:value,p_valuation_date:valuationDate,p_include:input.includeInTotal==null?true:asBoolean(input.includeInTotal),p_notes:nullableString(input.notes)});
  if (error) return apiFailure("net_worth.update", error, "net_worth_update_failed");
  const { data, error: readError } = await supabase.rpc("financial_app_net_worth_overview", { p_months: 18 });
  if (readError || !data) return apiFailure("net_worth.update.reload", readError, "net_worth_unavailable");
  return apiJson(normalizeNetWorth(data));
}

export async function DELETE(request: NextRequest) {
  const supabase = await getAuthorizedClient();if (!supabase) return apiUnauthorized();
  const id = request.nextUrl.searchParams.get("id");if (!id) return apiError("missing_id");
  const { error } = await supabase.rpc("financial_app_deactivate_net_worth_item", { p_id: id });
  if (error) return apiFailure("net_worth.delete", error, "net_worth_delete_failed");
  const { data, error: readError } = await supabase.rpc("financial_app_net_worth_overview", { p_months: 18 });
  if (readError || !data) return apiFailure("net_worth.delete.reload", readError, "net_worth_unavailable");
  return apiJson(normalizeNetWorth(data));
}
