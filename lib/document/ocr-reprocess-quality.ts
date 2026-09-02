import type { ImageOcrResult } from "./ticket-ocr";

export type OcrQualitySnapshot={
  validationStatus:"complete"|"needs_review"|"failed"|"unknown";
  printedTotal:number|null;
  validItems:number;
  invalidItems:number;
  unparsedBodyRows:number;
  criticalContradictions:number;
  usefulChars:number;
  confidence:number|null;
};

export type OcrReprocessQualityDecision={
  accepted:boolean;
  reason:
    |"no_previous_quality"
    |"validation_improved"
    |"same_or_better"
    |"validation_regressed"
    |"printed_total_lost"
    |"valid_items_regressed"
    |"text_coverage_regressed"
    |"critical_contradictions_regressed"
    |"confidence_regressed";
  previous:OcrQualitySnapshot;
  next:OcrQualitySnapshot;
};

type ExistingQualitySource={
  ocrStatus?:string|null;
  ocrData?:Record<string,unknown>|null;
};

function asRecord(value:unknown){return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function finite(value:unknown){const number=Number(value);return Number.isFinite(number)?number:null;}
function count(value:unknown){const number=finite(value);return number===null?0:Math.max(0,Math.trunc(number));}
function usefulChars(value:unknown){return String(value||"").replace(/\s/g,"").length;}
function normalizedStatus(value:unknown):OcrQualitySnapshot["validationStatus"]{
  const status=String(value||"").toLowerCase();
  if(status==="complete"||status==="manual")return"complete";
  if(status==="needs_review")return"needs_review";
  if(status==="failed"||status==="error")return"failed";
  return"unknown";
}
function rank(status:OcrQualitySnapshot["validationStatus"]){return status==="complete"?3:status==="needs_review"?2:status==="failed"?1:0;}
function criticalCount(validation:Record<string,unknown>|null){
  const values=Array.isArray(validation?.contradictions)?validation.contradictions:[];
  return values.filter(value=>String(asRecord(value)?.severity||"").toLowerCase()==="critical").length;
}

export function storedOcrQualitySnapshot(existing:ExistingQualitySource):OcrQualitySnapshot{
  const data=asRecord(existing.ocrData);
  const validation=asRecord(data?.validation);
  const validationStatus=validation?.status?normalizedStatus(validation.status):normalizedStatus(existing.ocrStatus);
  return{
    validationStatus,
    printedTotal:finite(validation?.printedTotal),
    validItems:count(validation?.validItems),
    invalidItems:count(validation?.invalidItems),
    unparsedBodyRows:count(validation?.unparsedBodyRows),
    criticalContradictions:criticalCount(validation),
    usefulChars:usefulChars(data?.normalizedText||data?.rawText),
    confidence:finite(data?.confidence),
  };
}

export function resultOcrQualitySnapshot(result:ImageOcrResult):OcrQualitySnapshot{
  const validation=result.validation;
  return{
    validationStatus:normalizedStatus(validation?.status),
    printedTotal:finite(validation?.printedTotal),
    validItems:count(validation?.validItems),
    invalidItems:count(validation?.invalidItems),
    unparsedBodyRows:count(validation?.unparsedBodyRows),
    criticalContradictions:Array.isArray(validation?.contradictions)?validation.contradictions.filter(item=>item.severity==="critical").length:0,
    usefulChars:usefulChars(result.normalizedText||result.rawText),
    confidence:finite(result.confidence),
  };
}

export function evaluateOcrReprocessQuality(existing:ExistingQualitySource,result:ImageOcrResult):OcrReprocessQualityDecision{
  const previous=storedOcrQualitySnapshot(existing);
  const next=resultOcrQualitySnapshot(result);
  const previousRank=rank(previous.validationStatus);
  const nextRank=rank(next.validationStatus);
  const decision=(accepted:boolean,reason:OcrReprocessQualityDecision["reason"]):OcrReprocessQualityDecision=>({accepted,reason,previous,next});

  if(previousRank===0&&previous.usefulChars===0)return decision(true,"no_previous_quality");
  if(nextRank>previousRank)return decision(true,"validation_improved");
  if(nextRank<previousRank)return decision(false,"validation_regressed");

  const gainedTotal=previous.printedTotal===null&&next.printedTotal!==null;
  const gainedItems=next.validItems>previous.validItems;
  const structuralGain=gainedTotal||gainedItems||next.criticalContradictions<previous.criticalContradictions;

  if(previous.printedTotal!==null&&next.printedTotal===null)return decision(false,"printed_total_lost");
  if(previous.validItems>=2&&next.validItems<Math.max(1,Math.ceil(previous.validItems*.6)))return decision(false,"valid_items_regressed");
  if(previous.usefulChars>=80&&next.usefulChars<Math.floor(previous.usefulChars*.65)&&!structuralGain)return decision(false,"text_coverage_regressed");
  if(next.criticalContradictions>previous.criticalContradictions+2&&!structuralGain)return decision(false,"critical_contradictions_regressed");
  if(previous.confidence!==null&&next.confidence!==null&&previous.confidence>=60&&next.confidence<previous.confidence-22&&!structuralGain)return decision(false,"confidence_regressed");

  return decision(true,"same_or_better");
}
