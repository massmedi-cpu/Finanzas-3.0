type CleanupRow={
  cleanup_id:number|string;
  document_id:string;
  bucket:string;
  storage_path:string;
  attempts:number;
};

type CleanupClient={
  rpc:(name:string,args?:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>;
  storage:{from:(bucket:string)=>{remove:(paths:string[])=>PromiseLike<{error:{message?:string}|null}>}};
};

export type DocumentStorageCleanupResult={
  attempted:number;
  completed:number;
  failed:number;
  remaining:number|null;
  unavailable:boolean;
};

function cleanupRows(value:unknown):CleanupRow[]{
  if(!Array.isArray(value))return[];
  return value.flatMap(item=>{
    if(!item||typeof item!=="object")return[];
    const row=item as Record<string,unknown>;
    const cleanupId=row.cleanup_id;
    const documentId=String(row.document_id||"");
    const bucket=String(row.bucket||"");
    const storagePath=String(row.storage_path||"");
    if((typeof cleanupId!=="number"&&typeof cleanupId!=="string")||!documentId||!bucket||!storagePath)return[];
    return[{cleanup_id:cleanupId,document_id:documentId,bucket,storage_path:storagePath,attempts:Number(row.attempts||0)}];
  });
}

export async function processDocumentStorageCleanup(client:CleanupClient,limit=20):Promise<DocumentStorageCleanupResult>{
  const safeLimit=Math.max(1,Math.min(100,Math.trunc(limit)||20));
  const pending=await client.rpc("financial_app_document_storage_cleanup_pending",{p_limit:safeLimit});
  if(pending.error)return{attempted:0,completed:0,failed:0,remaining:null,unavailable:true};

  const rows=cleanupRows(pending.data);
  let completed=0;
  let failed=0;
  for(const row of rows){
    const removed=await client.storage.from(row.bucket).remove([row.storage_path]);
    const success=!removed.error;
    const marked=await client.rpc("financial_app_document_storage_cleanup_mark",{
      p_cleanup_id:row.cleanup_id,
      p_success:success,
      p_error:removed.error?.message||null,
    });
    if(success&&!marked.error)completed+=1;
    else failed+=1;
  }

  const remainingResult=await client.rpc("financial_app_document_storage_cleanup_count");
  const remaining=remainingResult.error?null:Number(remainingResult.data||0);
  return{attempted:rows.length,completed,failed,remaining:Number.isFinite(remaining)?remaining:null,unavailable:false};
}
