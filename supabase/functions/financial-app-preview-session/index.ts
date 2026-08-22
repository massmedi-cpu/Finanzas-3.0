import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")??"";
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});}
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({ok:false},405);
 if(!SUPABASE_URL||!SERVICE_ROLE_KEY||!ANON_KEY)return json({ok:false},503);
 let body:{token?:string;host?:string};try{body=await req.json();}catch{return json({ok:false},400);}
 const token=String(body.token??"").trim();const host=String(body.host??"").trim().toLowerCase();
 if(token.length<32||token.length>160||host.length<4||host.length>255)return json({ok:false},400);
 const service=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const hash=await sha256(token);
 const {data:claim,error:claimError}=await service.rpc("financial_app_claim_preview_login",{p_token_hash:hash,p_host:host});
 const email=String((claim as {email?:string}|null)?.email??"").trim().toLowerCase();
 if(claimError||!email)return json({ok:false},401);
 const {data:usersPage,error:usersError}=await service.auth.admin.listUsers({page:1,perPage:1000});
 if(usersError)return json({ok:false},500);
 let user=usersPage.users.find(item=>String(item.email??"").trim().toLowerCase()===email)??null;
 if(!user){const {data:created,error:createError}=await service.auth.admin.createUser({email,email_confirm:true});if(createError||!created.user)return json({ok:false},500);user=created.user;}
 else if(!user.email_confirmed_at){const {data:confirmed,error:confirmError}=await service.auth.admin.updateUserById(user.id,{email_confirm:true});if(confirmError||!confirmed.user)return json({ok:false},500);user=confirmed.user;}
 const {data:link,error:linkError}=await service.auth.admin.generateLink({type:"magiclink",email});const tokenHash=link?.properties?.hashed_token;
 if(linkError||!tokenHash)return json({ok:false},500);
 const publicClient=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:verified,error:verifyError}=await publicClient.auth.verifyOtp({token_hash:tokenHash,type:"magiclink"});
 if(verifyError||!verified.session?.access_token||!verified.session?.refresh_token)return json({ok:false},500);
 return json({ok:true,access_token:verified.session.access_token,refresh_token:verified.session.refresh_token});
});
