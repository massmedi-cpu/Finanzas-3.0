import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { unzipSync } from "npm:fflate@0.8.2";

const VERSION = 5;
const FILE_ID = "1OT4QFeRDAchLkznnQvmAe3SslDVXDm1JXU_kIGIhtV8";
const FILE_NAME = "Movimientos bancarios - fuente";
const DRIVE_DOCUMENTS_ROOT_ID = "1HR64X9Tu2FuRD2cdyA6BGOIqfxZqtaIW";
const GOOGLE_EMAIL = "trayectos-clio@salud-conectada-d04bf.iam.gserviceaccount.com";
const SHEETS = ["Cuenta corriente · 3967", "Cuenta ahorro · 2504"];
const HEADER = ["ID origen","Fecha","Hora","Producto o cuenta","Entidad","Identificador","Tipo de producto","Tipo de movimiento","Categoría","Subcategoría","Concepto original","Concepto normalizado","Comercio o contraparte","Importe (€)","Saldo (€)","Canal","Cuenta de origen","Cuenta de destino","Conciliado","Revisar","Notas","Fuente"];
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_DRIVE_DOCUMENTS = 2000;
let tokenCache: { token: string; exp: number } | null = null;

type DriveScanStats={folders:number;listRequests:number;rawItems:number;supportedDocuments:number;maxDepth:number};
type SyncMetrics={runId:string;totalMs:number;timings:Record<string,number>;drive:DriveScanStats;sourceChanged:boolean;documentChanged:boolean;autoLinked:number};

class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
function env(name:string){const value=Deno.env.get(name)||"";if(!value)throw new Error(`${name.toLowerCase()}_missing`);return value;}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-financial-app-sync":String(VERSION)}});}
function authorization(req:Request){const h=req.headers.get("authorization")||"";return h.startsWith("Bearer ")?h:"";}
function serviceHeaders(extra:Record<string,string>={}){const key=env("SUPABASE_SERVICE_ROLE_KEY");return{apikey:key,authorization:`Bearer ${key}`,...extra};}
function ms(start:number){return Math.round((performance.now()-start)*10)/10;}
function errorCode(error:unknown){return error instanceof Error?error.message:String(error);}
function syncLog(metrics:SyncMetrics,ok=true,error?:string){console.log("financial_app_sync_metrics",JSON.stringify({...metrics,ok,error:error||undefined}));}
async function requireAllowedUser(req:Request){const auth=authorization(req);if(!auth)throw new HttpError(401,"unauthorized");const url=env("SUPABASE_URL"),anon=env("SUPABASE_ANON_KEY");const userRes=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,authorization:auth},cache:"no-store"});if(!userRes.ok)throw new HttpError(401,"invalid_session");const user=await userRes.json();const email=String(user?.email||"").trim().toLowerCase();if(!email)throw new HttpError(401,"email_missing");const access=await fetch(`${url}/rest/v1/financial_app_access?select=email&email=eq.${encodeURIComponent(email)}&enabled=eq.true&limit=1`,{headers:{apikey:anon,authorization:auth,accept:"application/json"},cache:"no-store"});if(!access.ok)throw new HttpError(403,"authorization_check_failed");const rows=await access.json();if(!Array.isArray(rows)||!rows.length)throw new HttpError(403,"forbidden");return email;}
async function sourceState(){const url=env("SUPABASE_URL");const r=await fetch(`${url}/rest/v1/rpc/financial_app_source_state`,{method:"POST",headers:serviceHeaders({"content-type":"application/json",accept:"application/json"}),body:"{}",cache:"no-store"});if(!r.ok)throw new Error(`source_state_${r.status}`);return r.json();}
async function applySnapshot(meta:any,rows:any[]){const url=env("SUPABASE_URL");const r=await fetch(`${url}/rest/v1/rpc/financial_app_apply_source_snapshot`,{method:"POST",headers:serviceHeaders({"content-type":"application/json",accept:"application/json"}),body:JSON.stringify({p_source_file_id:meta.id,p_source_modified_at:meta.modifiedTime||null,p_rows:rows}),cache:"no-store"});if(!r.ok)throw new Error(`snapshot_apply_${r.status}`);const data=await r.json();if(!data?.ok)throw new Error(String(data?.error||"snapshot_apply_failed"));return data;}
async function applyDriveDocuments(files:any[]){const url=env("SUPABASE_URL");const r=await fetch(`${url}/rest/v1/rpc/financial_app_import_drive_documents_deferred`,{method:"POST",headers:serviceHeaders({"content-type":"application/json",accept:"application/json"}),body:JSON.stringify({p_files:files}),cache:"no-store"});if(!r.ok){const detail=await r.text().catch(()=>"");throw new Error(`drive_documents_apply_${r.status}${detail?`_${detail.slice(0,160)}`:""}`);}const data=await r.json();if(!data?.ok)throw new Error(String(data?.error||"drive_documents_apply_failed"));return data;}
async function finalizeDocumentLinks(){const url=env("SUPABASE_URL");const r=await fetch(`${url}/rest/v1/rpc/financial_app_finalize_document_links`,{method:"POST",headers:serviceHeaders({"content-type":"application/json",accept:"application/json"}),body:"{}",cache:"no-store"});if(!r.ok)throw new Error(`document_links_finalize_${r.status}`);return r.json();}
function b64(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function pemBytes(raw:string){let value=String(raw||"").trim();try{const p=JSON.parse(value);if(typeof p==="string")value=p;else if(p?.private_key)value=p.private_key;}catch{}value=value.replace(/^GOOGLE_PRIVATE_KEY\s*=\s*/i,"").replace(/\\r\\n/g,"\n").replace(/\\n/g,"\n").replace(/\\r/g,"\n");const m=value.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);let body=(m?m[1]:value).replace(/\s+/g,"").replace(/[^A-Za-z0-9+/=]/g,"");const start=body.indexOf("MII");if(start>0)body=body.slice(start);while(body.length%4)body+="=";return Uint8Array.from(atob(body),c=>c.charCodeAt(0));}
async function googleToken(){const now=Math.floor(Date.now()/1000);if(tokenCache&&tokenCache.exp>now+60)return tokenCache.token;const enc=new TextEncoder();const h=b64(enc.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));const c=b64(enc.encode(JSON.stringify({iss:GOOGLE_EMAIL,scope:"https://www.googleapis.com/auth/drive.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})));const key=await crypto.subtle.importKey("pkcs8",pemBytes(env("GOOGLE_PRIVATE_KEY")),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);const sig=b64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(`${h}.${c}`))));const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${h}.${c}.${sig}`})});if(!r.ok)throw new Error(`google_auth_${r.status}`);const data=await r.json();if(!data?.access_token)throw new Error("google_auth_missing_token");tokenCache={token:data.access_token,exp:now+Number(data.expires_in||3600)};return data.access_token as string;}
async function driveMeta(token:string){const r=await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=id,name,mimeType,modifiedTime,size`,{headers:{authorization:`Bearer ${token}`},cache:"no-store"});if(!r.ok)throw new Error(`drive_meta_${r.status}`);return r.json();}
async function driveBytes(token:string,meta:any){const native=String(meta?.mimeType||"")==="application/vnd.google-apps.spreadsheet";const url=native?`https://www.googleapis.com/drive/v3/files/${FILE_ID}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`:`https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`;const r=await fetch(url,{headers:{authorization:`Bearer ${token}`},cache:"no-store"});if(!r.ok)throw new Error(`drive_download_${r.status}`);return new Uint8Array(await r.arrayBuffer());}
async function driveChildren(token:string,folderId:string,stats:DriveScanStats){const all:any[]=[];let pageToken="";do{const params=new URLSearchParams({q:`'${folderId}' in parents and trashed=false`,fields:"nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)",pageSize:"1000",spaces:"drive",supportsAllDrives:"true",includeItemsFromAllDrives:"true"});if(pageToken)params.set("pageToken",pageToken);stats.listRequests+=1;const r=await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`,{headers:{authorization:`Bearer ${token}`},cache:"no-store"});if(!r.ok)throw new Error(`drive_documents_list_${r.status}_${folderId}`);const data=await r.json();if(Array.isArray(data?.files)){all.push(...data.files);stats.rawItems+=data.files.length;}pageToken=String(data?.nextPageToken||"");}while(pageToken);return all;}
function supportedDriveDocument(file:any){const mime=String(file?.mimeType||"");return mime==="application/pdf"||mime.startsWith("image/");}
function parsedAmount(name:string){const matches=[...name.matchAll(/(-?\d[\d. ]*(?:,\d{2}|\.\d{2}))\s*(?:€|EUR)/gi)];const raw=matches.at(-1)?.[1]?.replace(/\s/g,"")||"";if(!raw)return null;const normalized=raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw;const value=Number(normalized);return Number.isFinite(value)?value:null;}
function folderMerchant(path:string[]){const generic=new Set(["compras_y_facturas","compras","servicios y suministros","facturas","factura","tickets","ticket","contratos","contrato","documentos"]);for(const raw of [...path].reverse()){const value=String(raw||"").trim();if(!value||/^20\d{2}$/.test(value)||generic.has(value.toLowerCase()))continue;const parts=value.split(/\s+-\s+/).filter(Boolean);return (parts.at(-1)||value).trim();}return null;}
function parsedDriveDocument(file:any,path:string[]){const name=String(file?.name||"").trim();const stem=name.replace(/\.[^.]+$/," ").trim();const parts=stem.split(/\s+-\s+/).map(value=>value.trim()).filter(Boolean);const dateMatch=stem.match(/(?:^|\b)(20\d{2})-(\d{2})-(\d{2})(?:\b|\s)/);const documentDate=dateMatch?`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`:null;let merchant=parts.length>1?parts[1]:null;if(!merchant||/^20\d{2}$/.test(merchant))merchant=folderMerchant(path);const context=`${path.join(" ")} ${name}`.toLowerCase();const documentType=context.includes("contrato")?"contract":context.includes("ticket")||context.includes("recibo")?"receipt":context.includes("factura")||context.includes("invoice")?"invoice":context.includes("impuesto")||context.includes("tribut")?"tax":"other";return{id:String(file.id),name,mimeType:String(file.mimeType||""),modifiedTime:String(file.modifiedTime||""),size:file.size==null?null:String(file.size),webViewLink:String(file.webViewLink||`https://drive.google.com/file/d/${file.id}/view`),folderPath:path.join(" / "),documentType,documentDate,amount:parsedAmount(stem),merchant:merchant||null};}
async function driveDocuments(token:string,stats:DriveScanStats){const queue:[string,string[],number][]=[[DRIVE_DOCUMENTS_ROOT_ID,["Compras_y_facturas"],0]];const files:any[]=[];while(queue.length){const [folderId,path,depth]=queue.shift()!;if(depth>10)throw new Error("drive_documents_depth_exceeded");stats.folders+=1;stats.maxDepth=Math.max(stats.maxDepth,depth);const children=await driveChildren(token,folderId,stats);for(const child of children){if(String(child?.mimeType||"")===DRIVE_FOLDER_MIME){queue.push([String(child.id),[...path,String(child.name||"")],depth+1]);continue;}if(!supportedDriveDocument(child))continue;files.push(parsedDriveDocument(child,path));stats.supportedDocuments+=1;if(files.length>MAX_DRIVE_DOCUMENTS)throw new Error("drive_documents_limit_exceeded");}}return files;}
function decodeXml(value:string){return String(value||"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));}
function attr(source:string,name:string){const safe=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const m=String(source||"").match(new RegExp(`(?:^|\\s)${safe}=(?:\"([^\"]*)\"|'([^']*)')`));return m?decodeXml(m[1]??m[2]??""):"";}
function textFile(zip:Record<string,Uint8Array>,path:string){const bytes=zip[path];if(!bytes)throw new Error(`xlsx_missing_${path}`);return new TextDecoder().decode(bytes);}
function sharedStrings(zip:Record<string,Uint8Array>){const bytes=zip["xl/sharedStrings.xml"];if(!bytes)return[] as string[];const xml=new TextDecoder().decode(bytes);const values:string[]=[];for(const m of xml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)){let value="";for(const t of m[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g))value+=decodeXml(t[1]);values.push(value);}return values;}
function resolveTarget(target:string){const value=String(target||"").replace(/\\/g,"/");if(value.startsWith("/xl/"))return value.slice(1);if(value.startsWith("xl/"))return value;const parts=["xl"];for(const segment of value.replace(/^\/+/ ,"").split("/")){if(!segment||segment===".")continue;if(segment==="..")parts.pop();else parts.push(segment);}return parts.join("/");}
function workbookSheets(zip:Record<string,Uint8Array>){const workbook=textFile(zip,"xl/workbook.xml"),rels=textFile(zip,"xl/_rels/workbook.xml.rels");const relMap=new Map<string,string>();for(const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/g))relMap.set(attr(m[1],"Id"),resolveTarget(attr(m[1],"Target")));const sheets:{name:string;path:string}[]=[];for(const m of workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?\s*>/g)){const name=attr(m[1],"name"),path=relMap.get(attr(m[1],"r:id"));if(name&&path)sheets.push({name,path});}return sheets;}
function cellValue(body:string,attrs:string,shared:string[]){const type=attr(attrs,"t");if(type==="inlineStr"){let value="";for(const m of body.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g))value+=decodeXml(m[1]);return value;}const m=body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/);const raw=m?decodeXml(m[1]):"";if(type==="s")return shared[Number(raw)]??"";if(type==="str")return raw;const n=Number(raw);return raw!==""&&Number.isFinite(n)?n:raw;}
function text(v:unknown){return String(v??"").trim();}
function number(v:unknown){return v===""||v===null||v===undefined?null:Number(v);}
function excelDate(v:unknown){if(typeof v==="string"){const raw=v.trim();if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)return`${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;}const n=Number(v);if(!Number.isFinite(n))return null;return new Date(Math.round((n-25569)*86400000)).toISOString().slice(0,10);}
function excelTime(v:unknown){if(v===null||v===undefined||v==="")return null;if(typeof v==="string"&&/^\d{1,2}:\d{2}(:\d{2})?$/.test(v.trim())){const p=v.trim().split(":");return`${p[0].padStart(2,"0")}:${p[1]}:${(p[2]||"00").padStart(2,"0")}`;}const n=Number(v);if(Number.isFinite(n)&&n>=0&&n<1){const total=Math.round(n*86400)%86400;return`${String(Math.floor(total/3600)).padStart(2,"0")}:${String(Math.floor((total%3600)/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;}return null;}
async function sha256(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function parseRows(bytes:Uint8Array){const zip=unzipSync(bytes) as Record<string,Uint8Array>;const shared=sharedStrings(zip),sheetList=workbookSheets(zip),paths=new Map(sheetList.map(s=>[s.name,s.path]));const byId=new Map<string,any>();for(const sheetName of SHEETS){const path=paths.get(sheetName);if(!path)throw new Error(`source_sheet_missing_${sheetName}`);const xml=textFile(zip,path);const rows:Record<string,unknown>[]=[];for(const rowMatch of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)){const values:Record<string,unknown>={};for(const cellMatch of rowMatch[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)){const ref=attr(cellMatch[1],"r"),column=(ref.match(/^([A-Z]+)/)||[])[1];if(column)values[column]=cellValue(cellMatch[2]||"",cellMatch[1],shared);}rows.push(values);}const header=rows[0]||{};const actual=Array.from({length:22},(_,i)=>text(header[String.fromCharCode(65+i)]??""));if(!HEADER.every((v,i)=>actual[i]===v))throw new Error(`source_schema_mismatch_${sheetName}`);for(const row of rows.slice(1)){const r=Array.from({length:22},(_,i)=>row[String.fromCharCode(65+i)]??"");const sourceId=text(r[0]);if(!(sourceId||r[1]||r[10]||r[13]!==""))continue;if(!sourceId)throw new Error("source_id_missing");const payload={"ID origen":sourceId,"Fecha":r[1]??null,"Hora":r[2]??null,"Producto o cuenta":text(r[3]),"Entidad":text(r[4]),"Identificador":text(r[5]),"Tipo de producto":text(r[6]),"Tipo de movimiento":text(r[7]),"Categoría":text(r[8]),"Subcategoría":text(r[9]),"Concepto original":text(r[10]),"Concepto normalizado":text(r[11]),"Comercio o contraparte":text(r[12]),"Importe (€)":number(r[13]),"Saldo (€)":number(r[14]),"Canal":text(r[15]),"Cuenta de origen":text(r[16]),"Cuenta de destino":text(r[17]),"Conciliado":text(r[18]),"Revisar":text(r[19]),"Notas":text(r[20]),"Fuente":text(r[21])};const item={source_id:sourceId,source_hash:await sha256(JSON.stringify(payload)),source_payload:payload,source_date:excelDate(r[1]),source_time:excelTime(r[2]),source_account:payload["Producto o cuenta"],source_entity:payload["Entidad"],source_identifier:payload["Identificador"],source_product_type:payload["Tipo de producto"],source_transaction_type:payload["Tipo de movimiento"],source_category:payload["Categoría"],source_subcategory:payload["Subcategoría"],source_original_concept:payload["Concepto original"],source_normalized_concept:payload["Concepto normalizado"],source_counterparty:payload["Comercio o contraparte"],source_amount:payload["Importe (€)"],source_balance:payload["Saldo (€)"],source_channel:payload["Canal"],source_origin_account:payload["Cuenta de origen"]||null,source_destination_account:payload["Cuenta de destino"]||null,source_reconciled:payload["Conciliado"]||null,source_review:payload["Revisar"]||null,source_notes:payload["Notas"]||null,source_document_url:payload["Fuente"]||null};const previous=byId.get(sourceId);if(previous){const compatible=previous.source_date===item.source_date&&previous.source_amount===item.source_amount&&previous.source_identifier===item.source_identifier&&previous.source_account===item.source_account;if(!compatible)throw new Error(`source_duplicate_id_conflict_${sourceId}`);}byId.set(sourceId,item);}}const items=[...byId.values()];if(!items.length)throw new Error("source_empty");return items;}

Deno.serve(async(req:Request)=>{
  const runId=crypto.randomUUID();
  const started=performance.now();
  const timings:Record<string,number>={};
  const driveStats:DriveScanStats={folders:0,listRequests:0,rawItems:0,supportedDocuments:0,maxDepth:0};
  let sourceChanged=false;
  let documentChanged=false;
  let autoLinked=0;
  try{
    if(req.method!=="GET"&&req.method!=="POST")throw new HttpError(405,"method_not_allowed");

    let phase=performance.now();
    const email=await requireAllowedUser(req);
    timings.auth=ms(phase);

    phase=performance.now();
    const token=await googleToken();
    timings.googleAuth=ms(phase);

    phase=performance.now();
    const [meta,state]=await Promise.all([driveMeta(token),sourceState()]);
    timings.sourceLookup=ms(phase);
    if(meta.id!==FILE_ID||meta.name!==FILE_NAME)throw new Error("source_identity_mismatch");
    const sourceUnchanged=Boolean(state?.source_file_id===meta.id&&state?.source_modified_at&&Date.parse(state.source_modified_at)===Date.parse(meta.modifiedTime||""));
    sourceChanged=!sourceUnchanged;

    const documentScanPromise=(async()=>{const start=performance.now();const files=await driveDocuments(token,driveStats);timings.driveScan=ms(start);return files;})();
    const rowsPromise=sourceUnchanged?null:(async()=>{let start=performance.now();const bytes=await driveBytes(token,meta);timings.sourceDownload=ms(start);start=performance.now();const rows=await parseRows(bytes);timings.sourceParse=ms(start);return rows;})();

    let documents:any={ok:false,error:"drive_documents_not_checked"};
    try{
      const files=await documentScanPromise;
      phase=performance.now();
      documents=await applyDriveDocuments(files);
      timings.documentsApply=ms(phase);
      documentChanged=Boolean(documents?.changed);
    }catch(documentError){
      documents={ok:false,error:"drive_documents_failed"};
      console.error("financial_app_drive_documents_error",JSON.stringify({runId,error:errorCode(documentError)}));
    }

    let sync:any=null;
    let rowCount:number|undefined;
    if(rowsPromise){
      const items=await rowsPromise;
      rowCount=items.length;
      phase=performance.now();
      sync=await applySnapshot(meta,items);
      timings.snapshotApply=ms(phase);
    }

    let autoLink:any={linked:0};
    try{
      phase=performance.now();
      autoLink=await finalizeDocumentLinks();
      timings.autoLink=ms(phase);
      autoLinked=Number(autoLink?.linked||0);
    }catch(linkError){
      autoLink={linked:0,error:"auto_link_failed"};
      console.error("financial_app_document_links_error",JSON.stringify({runId,error:errorCode(linkError)}));
    }
    documents={...documents,autoLink};

    const metrics:SyncMetrics={runId,totalMs:ms(started),timings,drive:driveStats,sourceChanged,documentChanged,autoLinked};
    syncLog(metrics,true);
    const changed=sourceChanged||documentChanged||autoLinked>0;
    if(sourceUnchanged){
      return json({ok:true,changed,skipped:true,source:{id:meta.id,name:meta.name,modifiedTime:meta.modifiedTime},documents,lastSync:state.finished_at,user:email,metrics});
    }
    return json({ok:true,changed,source:{id:meta.id,name:meta.name,modifiedTime:meta.modifiedTime,rowCount,sheets:SHEETS},sync,documents,user:email,metrics});
  }catch(error){
    const status=error instanceof HttpError?error.status:500;
    const metrics:SyncMetrics={runId,totalMs:ms(started),timings,drive:driveStats,sourceChanged,documentChanged,autoLinked};
    syncLog(metrics,false,errorCode(error));
    console.error("financial_app_sync_error",JSON.stringify({runId,error:errorCode(error)}));
    return json({ok:false,error:errorCode(error),runId},status);
  }
});
