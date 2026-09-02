export type ManualReviewRequiredField="documentDate"|"amount";

export function manualReviewMissingFields(documentType:unknown,documentDate:unknown,amount:unknown):ManualReviewRequiredField[]{
  const type=String(documentType||"").trim().toLowerCase();
  if(type!=="receipt"&&type!=="invoice")return[];

  const missing:ManualReviewRequiredField[]=[];
  const date=String(documentDate||"").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))missing.push("documentDate");

  const normalized=typeof amount==="string"?amount.trim().replace(",","."):amount;
  const numeric=normalized===""||normalized==null?Number.NaN:Number(normalized);
  if(!Number.isFinite(numeric))missing.push("amount");
  return missing;
}

export function manualReviewReady(documentType:unknown,documentDate:unknown,amount:unknown){
  return manualReviewMissingFields(documentType,documentDate,amount).length===0;
}
