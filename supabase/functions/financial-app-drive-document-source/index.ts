import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERSION=1;
const MAX_SOURCE_BYTES=12*1024*1024;
const GOOGLE_EMAIL="trayectos-clio@salud-conectada-d04bf.iam.gserviceaccount.com";
let tokenCache:{token:string;exp:number}|null=null;

class HttpError extends Error{constructor(readonly status:number,message:string){super(message)}}
function env(name:string){const value=Deno.env.get(name)||"";if(!value)throw new Error(`${name.toLowerCase()}_missing`);return value;}
function authorization(req:Request){const value=req.headers.get("authorization")||"";return value.startsWith("Bearer ")?value:"";}
function serviceHeaders(extra:Record<string,string>={}){const key=env("SUPABASE_SERVICE_ROLE_KEY");return{apikey:key,authorization:`Bearer ${key}`,...extra};}
function fail(code:string,status:number){return new Response(JSON.stringify({ok:false,error:code}),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff","x-financial-app-drive-source":String(VERSION)}})}

async function requireAllowedUser(req:Request){
  const auth=authorization(req);if(!auth)throw new HttpError(401,"unauthorized");const url=env("SUPABASE_URL"),anon=env("SUPABASE_ANON_KEY");
  const userRes=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,authorization:auth},cache:"no-store"});if(!userRes.ok)throw new HttpError(401,"invalid_session");
  const user=await userRes.json();const email=String(user?.email||"").trim().toLowerCase();if(!email)throw new HttpError(401,"email_missing");
  const access=await fetch(`${url}/rest/v1/financial_app_access?select=email&email=eq.${encodeURIComponent(email)}&enabled=eq.true&limit=1`,{headers:{apikey:anon,authorization:auth,accept:"application/json"},cache:"no-store"});if(!access.ok)throw new HttpError(403,"authorization_check_failed");
  const rows=await access.json();if(!Array.isArray(rows)||!rows.length)throw new HttpError(403,"forbidden");
}
async function rpc(name:string,body:unknown){const response=await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${name}`,{method:"POST",headers:serviceHeaders({"content-type":"application/json",accept:"application/json"}),body:JSON.stringify(body),cache:"no-store"});if(!response.ok)throw new Error(`${name}_${response.status}`);return response.json();}
function b64(bytes:Uint8Array){let value="";for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function pemBytes(raw:string){let value=String(raw||"").trim();try{const parsed=JSON.parse(value);if(typeof parsed==="string")value=parsed;else if(parsed?.private_key)value=parsed.private_key}catch{}value=value.replace(/^GOOGLE_PRIVATE_KEY\s*=\s*/i,"").replace(/\\r\\n/g,"\n").replace(/\\n/g,"\n").replace(/\\r/g,"\n");const match=value.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);let body=(match?match[1]:value).replace(/\s+/g,"").replace(/[^A-Za-z0-9+/=]/g,"");const start=body.indexOf("MII");if(start>0)body=body.slice(start);while(body.length%4)body+="=";return Uint8Array.from(atob(body),char=>char.charCodeAt(0));}
async function googleToken(){
  const now=Math.floor(Date.now()/1000);if(tokenCache&&tokenCache.exp>now+60)return tokenCache.token;const encoder=new TextEncoder();const header=b64(encoder.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));const claims=b64(encoder.encode(JSON.stringify({iss:GOOGLE_EMAIL,scope:"https://www.googleapis.com/auth/drive.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})));
  const key=await crypto.subtle.importKey("pkcs8",pemBytes(env("GOOGLE_PRIVATE_KEY")),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);const signature=b64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,encoder.encode(`${header}.${claims}`))));
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${header}.${claims}.${signature}`})});if(!response.ok)throw new Error(`google_auth_${response.status}`);const data=await response.json();if(!data?.access_token)throw new Error("google_auth_missing_token");tokenCache={token:data.access_token,exp:now+Number(data.expires_in||3600)};return tokenCache.token;
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method!=="POST")throw new HttpError(405,"method_not_allowed");await requireAllowedUser(req);let body:unknown;try{body=await req.json()}catch{throw new HttpError(400,"invalid_json")};const documentId=body&&typeof body==="object"?String((body as Record<string,unknown>).documentId||""):"";if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId))throw new HttpError(400,"invalid_document_id");
    const source=await rpc("financial_app_drive_document_hydration_source",{p_document_id:documentId});if(!source?.driveId)throw new HttpError(404,"hydration_source_unavailable");const expectedSize=Number(source.fileSize);if(Number.isFinite(expectedSize)&&expectedSize>MAX_SOURCE_BYTES)throw new HttpError(413,"hydration_source_too_large");const mime=String(source.mimeType||"");if(mime!=="application/pdf"&&!mime.startsWith("image/"))throw new HttpError(415,"hydration_source_unsupported");
    const token=await googleToken();const drive=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(source.driveId))}?alt=media&supportsAllDrives=true`,{headers:{authorization:`Bearer ${token}`},cache:"no-store"});if(!drive.ok)throw new Error(`drive_download_${drive.status}`);const declared=Number(drive.headers.get("content-length")||0);if(declared>MAX_SOURCE_BYTES)throw new HttpError(413,"hydration_source_too_large");const bytes=new Uint8Array(await drive.arrayBuffer());if(!bytes.byteLength||bytes.byteLength>MAX_SOURCE_BYTES)throw new HttpError(bytes.byteLength?413:422,bytes.byteLength?"hydration_source_too_large":"hydration_source_empty");
    return new Response(bytes,{status:200,headers:{"content-type":mime,"content-length":String(bytes.byteLength),"cache-control":"private, no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-financial-app-drive-source":String(VERSION),"x-drive-source-modified-at":String(source.sourceModifiedAt||"")}});
  }catch(error){const status=error instanceof HttpError?error.status:502;const code=error instanceof Error?error.message:"drive_source_failed";console.error("financial_app_drive_document_source_error",JSON.stringify({code,status}));return fail(code,status);}
});
