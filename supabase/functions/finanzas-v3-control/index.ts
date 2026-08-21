import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const LEGACY_API = "https://ulxsvuksrghjgcjfuegv.supabase.co/functions/v1/finanzas-alberto-api";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REST = `${SUPABASE_URL}/rest/v1`;
const PRINCIPAL_KEY = "private-session-owner";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
}
function bearer(req: Request) { const auth=req.headers.get("authorization")||""; return auth.startsWith("Bearer ")?auth.slice(7):""; }
async function authorized(token: string) { if(!token) return false; try { const response=await fetch(`${LEGACY_API}/api/__finanzas_v3_token_probe__`,{headers:{authorization:`Bearer ${token}`,accept:"application/json"},cache:"no-store"}); return response.ok; } catch { return false; } }
function headers() { return { apikey:SERVICE_ROLE, authorization:`Bearer ${SERVICE_ROLE}`, "content-type":"application/json", accept:"application/json" }; }
async function rest(path:string,init:RequestInit={}) { const response=await fetch(`${REST}/${path}`,{...init,headers:{...headers(),...(init.headers||{})},cache:"no-store"}); const text=await response.text(); const data=text?JSON.parse(text):null; if(!response.ok) throw new Error(data?.message||data?.hint||`rest_${response.status}`); return data; }
async function rpc(name:string,body:Record<string,unknown>) { return rest(`rpc/${name}`,{method:"POST",body:JSON.stringify(body)}); }
function pathOf(req:Request){const url=new URL(req.url);const marker="/finanzas-v3-control";const index=url.pathname.lastIndexOf(marker);return index>=0?(url.pathname.slice(index+marker.length)||"/"):url.pathname;}
function cleanNote(value:unknown){const text=String(value??"").trim();return text?text.slice(0,1000):null;}

Deno.serve(async(req:Request)=>{
  const path=pathOf(req);
  if(path==="/health") return json({ok:true,version:1});
  const token=bearer(req);
  if(!(await authorized(token))) return json({ok:false,error:"unauthorized"},401);
  try{
    if(path==="/snapshot"&&req.method==="GET") return json(await rpc("finance_v280_system_snapshot",{p_principal_key:PRINCIPAL_KEY}));
    if(path==="/history"&&req.method==="GET"){
      const rows=await rest("finance_v3_system_audits?select=*&order=captured_at.desc&limit=30");
      return json({ok:true,audits:Array.isArray(rows)?rows:[]});
    }
    if(path==="/capture"&&req.method==="POST"){
      const body=await req.json().catch(()=>({}));
      const snapshot=await rpc("finance_v280_system_snapshot",{p_principal_key:PRINCIPAL_KEY}) as Record<string,unknown>;
      const state=(snapshot.state||{}) as Record<string,unknown>;
      const payload={status:String(snapshot.status||"error"),source_checksum:state.currentChecksum||null,current_rows:Number(state.currentRows)||0,normalized_rows:Number(state.normalizedRows)||0,snapshot,note:cleanNote(body.note)};
      const rows=await rest("finance_v3_system_audits",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify(payload)});
      return json({ok:true,audit:Array.isArray(rows)?rows[0]??null:rows});
    }
    return json({ok:false,error:"not_found"},404);
  }catch(error){const message=String((error as Error)?.message||error);console.error("finanzas_v3_control_error",message);return json({ok:false,error:message},500);}
});
