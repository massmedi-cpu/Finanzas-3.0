import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError,apiFailure,apiJson,apiUnauthorized } from "@/lib/api/response";
import { asArray,asRecord,asString } from "@/lib/validation/json";

export const dynamic="force-dynamic";

type Operation={documentId:string;action:"link"|"archive";sourceId?:string};

function parseOperation(value:unknown):Operation|null{
  const input=asRecord(value),documentId=asString(input.documentId),action=asString(input.action),sourceId=asString(input.sourceId);
  if(!documentId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId))return null;
  if(action!=="link"&&action!=="archive")return null;
  if(action==="link"&&!sourceId)return null;
  return action==="link"?{documentId,action,sourceId}:{documentId,action};
}

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();
  let body:unknown;
  try{body=await request.json();}catch{return apiError("invalid_json");}
  const operations=asArray(asRecord(body).operations).map(parseOperation).filter((item):item is Operation=>Boolean(item));
  if(!operations.length||operations.length>50)return apiError("invalid_document_operations");
  const {data,error}=await supabase.rpc("financial_app_document_operations_batch",{p_operations:operations});
  if(error||!data)return apiFailure("archive.operations.batch",error,"document_operations_failed");
  return apiJson({ok:true,result:data});
}
