import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { asRecord } from "@/lib/validation/json";

export const dynamic = "force-dynamic";
const MAX_BULK_MOVEMENTS = 200;

export async function POST(request: NextRequest) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return NextResponse.json({ ok:false, error:"unauthorized" }, { status:401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok:false, error:"invalid_json" }, { status:400 }); }

  const input = asRecord(body);
  const action = String(input.action ?? "apply");

  if (action === "undo") {
    const batchId = typeof input.batchId === "string" && input.batchId.trim() ? input.batchId.trim() : null;
    const { data, error } = await supabase.rpc("financial_app_undo_bulk_transaction_batch", { p_batch_id:batchId });
    if (error || !data) {
      const message = error?.message || "bulk_undo_failed";
      const status = message.includes("changed_since_apply") ? 409 : 400;
      return NextResponse.json({ ok:false, error:message }, { status });
    }
    return NextResponse.json(data, { headers:{ "Cache-Control":"private, no-store" } });
  }

  if (action !== "apply") return NextResponse.json({ ok:false, error:"unsupported_action" }, { status:400 });

  const ids = Array.isArray(input.ids)
    ? [...new Set(input.ids.map(value => String(value ?? "").trim()).filter(Boolean))]
    : [];
  const patch = asRecord(input.patch);

  if (!ids.length) return NextResponse.json({ ok:false, error:"no_transactions_selected" }, { status:400 });
  if (ids.length > MAX_BULK_MOVEMENTS) return NextResponse.json({ ok:false, error:"bulk_limit_exceeded", limit:MAX_BULK_MOVEMENTS }, { status:400 });
  if (!Object.keys(patch).length) return NextResponse.json({ ok:false, error:"invalid_patch" }, { status:400 });

  const { data, error } = await supabase.rpc("financial_app_bulk_update_transactions", {
    p_transaction_ids: ids,
    p_patch: patch,
  });
  if (error || !data) return NextResponse.json({ ok:false, error:error?.message || "bulk_update_failed" }, { status:400 });

  return NextResponse.json(data, { headers:{ "Cache-Control":"private, no-store" } });
}
