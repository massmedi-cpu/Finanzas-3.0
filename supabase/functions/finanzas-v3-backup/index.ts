import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const LEGACY_API = "https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-alberto-api";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REST = `${SUPABASE_URL}/rest/v1`;
const VERSION = 1;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-finanzas-backup": String(VERSION) } });
}
function bearer(req: Request) { const auth=req.headers.get("authorization")||""; return auth.startsWith("Bearer ") ? auth.slice(7) : ""; }
async function authorized(token: string) {
  if (!token) return false;
  try {
    const response=await fetch(`${LEGACY_API}/api/__finanzas_v3_token_probe__`,{headers:{authorization:`Bearer ${token}`,accept:"application/json"},cache:"no-store"});
    return response.ok || response.status===404;
  } catch { return false; }
}
function headers() {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("supabase_env_missing");
  return { apikey:SERVICE_ROLE, authorization:`Bearer ${SERVICE_ROLE}`, "content-type":"application/json", accept:"application/json" };
}
async function rest(path: string, init: RequestInit={}) {
  const response=await fetch(`${REST}/${path}`,{...init,headers:{...headers(),...(init.headers||{})},cache:"no-store"});
  const text=await response.text();
  const data=text?JSON.parse(text):null;
  if(!response.ok) throw new Error(data?.message||data?.hint||`rest_${response.status}`);
  return data;
}
async function rpc(name: string, body: Record<string,unknown>={}) { return rest(`rpc/${name}`,{method:"POST",body:JSON.stringify(body)}); }
function pathOf(req: Request) { const url=new URL(req.url); const marker="/finanzas-v3-backup"; const i=url.pathname.lastIndexOf(marker); return i>=0 ? (url.pathname.slice(i+marker.length)||"/") : url.pathname; }
function note(value: unknown) { const x=String(value??"").trim(); return x ? x.slice(0,1000) : null; }
function uuid(value: unknown) { const x=String(value??"").trim(); return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x) ? x : null; }

Deno.serve(async (req: Request) => {
  const path=pathOf(req);
  if(path==="/health") return json({ok:true,version:VERSION});
  const token=bearer(req);
  if(!(await authorized(token))) return json({ok:false,error:"unauthorized"},401);
  try {
    const url=new URL(req.url);
    if(path==="/snapshot" && req.method==="GET") return json(await rpc("finance_v290_private_backup_snapshot"));
    if(path==="/preview" && req.method==="POST") {
      const body=await req.json().catch(()=>({}));
      const backup=(body as any)?.backup;
      if(!backup || typeof backup!=="object") return json({ok:false,error:"backup_required"},400);
      return json(await rpc("finance_v290_backup_preview",{p_backup:backup}));
    }
    if(path==="/capture" && req.method==="POST") {
      const body=await req.json().catch(()=>({}));
      return json(await rpc("finance_v290_capture_private_backup",{p_note:note((body as any)?.note)}));
    }
    if(path==="/history" && req.method==="GET") {
      const rows=await rest("finance_v3_private_backups?select=id,captured_at,source_checksum,source_rows,schema_version,note&order=captured_at.desc&limit=30");
      return json({ok:true,backups:Array.isArray(rows)?rows:[]});
    }
    if(path==="/saved" && req.method==="GET") {
      const id=uuid(url.searchParams.get("id"));
      if(!id) return json({ok:false,error:"backup_id_required"},400);
      const rows=await rest(`finance_v3_private_backups?id=eq.${encodeURIComponent(id)}&select=id,captured_at,source_checksum,source_rows,schema_version,payload,note&limit=1`);
      const backup=Array.isArray(rows)?rows[0]:null;
      return backup ? json({ok:true,backup}) : json({ok:false,error:"backup_not_found"},404);
    }
    if(path==="/restore" && req.method==="POST") {
      const body=await req.json().catch(()=>({}));
      const backup=(body as any)?.backup;
      const expectedChecksum=String((body as any)?.expectedChecksum||"");
      const confirmation=String((body as any)?.confirmation||"");
      if(confirmation!=="RESTAURAR") return json({ok:false,error:"restore_confirmation_required"},400);
      if(!backup || typeof backup!=="object") return json({ok:false,error:"backup_required"},400);
      const preview=await rpc("finance_v290_backup_preview",{p_backup:backup}) as any;
      if(!preview?.safe) return json({ok:false,error:"backup_not_safe_to_restore",preview},409);
      const result=await rpc("finance_v290_restore_private_backup",{p_backup:backup,p_expected_checksum:expectedChecksum,p_confirm_replace:true});
      return json({ok:true,preview,restore:result});
    }
    return json({ok:false,error:"not_found"},404);
  } catch(error) {
    const message=String((error as Error)?.message||error);
    const bad=["restore_confirmation_required","backup_not_safe_to_restore","restore_checksum_mismatch"].some((x)=>message.includes(x));
    console.error("finanzas_v3_backup_error",message);
    return json({ok:false,error:message},bad?409:500);
  }
});
