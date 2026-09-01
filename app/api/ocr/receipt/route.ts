import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api/response";
import { recognizeServerReceiptImage, ServerReceiptOcrError } from "@/lib/document/server-receipt-ocr";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

export async function POST(request:NextRequest){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();

  const declaredContentType=(request.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();
  if(declaredContentType&&!declaredContentType.startsWith("image/"))return apiError("ocr_image_required",415);

  try{
    const result=await recognizeServerReceiptImage(Buffer.from(await request.arrayBuffer()));
    return apiJson({
      ok:true,
      result:{
        image:result.image,
        items:result.items,
        metrics:result.metrics,
        runtime:result.runtime,
      },
    });
  }catch(failure){
    const error=failure instanceof ServerReceiptOcrError?failure:new ServerReceiptOcrError("ocr_server_failed",503,true,failure);
    console.error("financial_app_server_receipt_ocr_failed",{code:error.code,retryable:error.retryable});
    return apiError(error.code,error.status);
  }
}
