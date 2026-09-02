import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api/response";
import { processDriveDocumentHydration } from "@/lib/document/drive-content-hydration";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration=60;

type JsonRecord=Record<string,unknown>;
function record(value:unknown):JsonRecord{return value&&typeof value==="object"&&!Array.isArray(value)?value as JsonRecord:{}}
function count(value:unknown){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
function nullableCount(value:unknown){if(value==null)return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null}
function text(value:unknown){const result=String(value??"").trim();return result||null}

export async function POST() {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) return apiError("session_unavailable", 401);

  try {
    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/financial-app-sync`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "sync" }),
      cache: "no-store",
    });

    const raw = await upstream.text();
    let payload: JsonRecord | null = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (!upstream.ok || !payload || payload.ok === false) {
      console.error("financial_app_api_failure", { context: "sync.upstream", status: upstream.status });
      return apiError("sync_failed", upstream.status >= 500 ? 502 : Math.max(400, upstream.status));
    }

    let contentHydration: JsonRecord;
    try {
      const result = await processDriveDocumentHydration(supabase, accessToken);
      contentHydration = { ...result, ok: true };
      if (result.completed > 0 || result.review > 0 || result.linked > 0) payload.changed = true;
    } catch (failure) {
      console.error("financial_app_drive_content_hydration_unavailable", {
        type: failure instanceof Error ? failure.name : "unknown_failure",
      });
      contentHydration = { ok: false, error: "drive_content_hydration_unavailable" };
    }

    const documents = record(payload.documents);
    payload.documents = { ...documents, contentHydration };

    // Verificación posterior: no confiamos solo en que la Edge Function haya respondido 200.
    // Leemos el estado canónico ya persistido y devolvemos al cliente hechos comprobables.
    const pulseResult=await supabase.rpc("financial_app_home_pulse",{});
    if(!pulseResult.error&&pulseResult.data){
      const pulse=record(pulseResult.data);
      const persistedSync=record(pulse.sync);
      const source=record(payload.source);
      const sync=record(payload.sync);
      const metrics=record(payload.metrics);
      const sourceChanged=metrics.sourceChanged===true;
      const sourceUnchanged=payload.skipped===true;
      const newCount=sourceChanged?count(sync.new):0;
      const updatedCount=sourceChanged?count(sync.updated):0;
      const reviewSourceCount=sourceChanged?count(sync.review_source):0;
      const sourceChangedNoMovementRows=sourceChanged&&newCount===0&&updatedCount===0&&reviewSourceCount===0;
      payload.diagnostics={
        sourceChanged,
        sourceUnchanged,
        sourceChangedNoMovementRows,
        verificationStatus:sourceUnchanged?"source_unchanged":sourceChangedNoMovementRows?"source_changed_no_movement_rows":"verified",
        sourceModifiedAt:text(source.modifiedTime)||text(persistedSync.sourceModifiedAt),
        lastCheckAt:text(persistedSync.finishedAt),
        sourceRowCount:nullableCount(source.rowCount),
        rowsSeen:sourceChanged?nullableCount(sync.seen):null,
        newCount,
        updatedCount,
        reviewSourceCount,
        latestMovementDate:text(pulse.lastMovementDate),
        documentChanged:metrics.documentChanged===true,
        autoLinked:count(metrics.autoLinked),
      };
    }else{
      console.error("financial_app_sync_diagnostics_unavailable",{type:pulseResult.error?.name||"unknown_failure"});
      payload.diagnostics={verificationStatus:"unavailable"};
    }

    return apiJson(payload, upstream.status);
  } catch {
    console.error("financial_app_api_failure", { context: "sync.fetch", publicCode: "sync_unavailable" });
    return apiError("sync_unavailable", 502);
  }
}
