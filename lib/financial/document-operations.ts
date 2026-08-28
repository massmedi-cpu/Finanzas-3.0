import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asArray,asBoolean,asNumber,asRecord,asString } from "@/lib/validation/json";
import { parseDocumentTriage,type DocumentTriageDocument,type DocumentTriageSummary,type DocumentTriageAction } from "@/lib/financial/document-triage";

export type DocumentSafeOperation={
  action:"link"|"archive";
  sourceId?:string;
  label:string;
  reversible:true;
};

export type DocumentOperationDocument=DocumentTriageDocument&{safeOperation:DocumentSafeOperation|null};
export type DocumentOperationSummary={safe:number;link:number;archive:number;manual:number};
export type DocumentOperations={
  version:string;
  generatedAt:string;
  summary:DocumentTriageSummary;
  operationSummary:DocumentOperationSummary;
  documents:DocumentOperationDocument[];
  rules:{
    readOnly:boolean;
    noAutomaticActions:boolean;
    usesCanonicalMatchingPolicy:boolean;
    priorityOrder:DocumentTriageAction[];
    operationsEnabled:boolean;
    explicitApprovalRequired:boolean;
    serverRevalidationRequired:boolean;
    ambiguousBatchActions:boolean;
    maxBatchSize:number;
    reversibleSafeActions:boolean;
  };
};

const safeOperation=(value:unknown):DocumentSafeOperation|null=>{
  const x=asRecord(value),action=asString(x.action),label=asString(x.label);
  if((action!=="link"&&action!=="archive")||!label||!asBoolean(x.reversible))return null;
  const sourceId=asString(x.sourceId);
  if(action==="link"&&!sourceId)return null;
  return action==="link"?{action,sourceId,label,reversible:true}:{action,label,reversible:true};
};

export function parseDocumentOperations(value:unknown):DocumentOperations{
  const base=parseDocumentTriage(value),root=asRecord(value),operationSummary=asRecord(root.operationSummary),rules=asRecord(root.rules);
  const rawDocuments=asArray(root.documents);
  return{
    version:asString(root.version,APP_VERSION),
    generatedAt:asString(root.generatedAt,base.generatedAt),
    summary:base.summary,
    operationSummary:{
      safe:asNumber(operationSummary.safe),
      link:asNumber(operationSummary.link),
      archive:asNumber(operationSummary.archive),
      manual:asNumber(operationSummary.manual),
    },
    documents:base.documents.map((document,index)=>({...document,safeOperation:safeOperation(asRecord(rawDocuments[index]).safeOperation)})),
    rules:{
      ...base.rules,
      operationsEnabled:asBoolean(rules.operationsEnabled),
      explicitApprovalRequired:asBoolean(rules.explicitApprovalRequired),
      serverRevalidationRequired:asBoolean(rules.serverRevalidationRequired),
      ambiguousBatchActions:asBoolean(rules.ambiguousBatchActions),
      maxBatchSize:Math.max(1,Math.min(50,asNumber(rules.maxBatchSize,50))),
      reversibleSafeActions:asBoolean(rules.reversibleSafeActions),
    },
  };
}

export async function getDocumentOperations(limit=60):Promise<DocumentOperations>{
  const safeLimit=Math.max(1,Math.min(100,Number.isFinite(limit)?Math.trunc(limit):60));
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_document_operations",{p_limit:safeLimit});
  if(error||!data)throw new Error(error?.message||"document_operations_unavailable");
  return parseDocumentOperations(data);
}
