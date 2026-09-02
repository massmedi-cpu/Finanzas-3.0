import type { ReceiptValidationStatus } from "./receipt-financial-validator";

export type OperationalOcrStatus="complete"|"needs_review"|"failed"|"error";

export function hasUsefulOcrText(value:string|null|undefined){
  return String(value||"").replace(/\s/g,"").length>=8;
}

/**
 * Financial validation and OCR execution are different layers.
 * - complete: the financial reconstruction is fully validated.
 * - needs_review: OCR produced usable evidence, but the reconstruction is not safe
 *   enough to declare complete (including validator status "failed").
 * - failed: reserved for an OCR result without useful text. Runtime/transport
 *   failures are also stored as failed by the caller's exception path.
 */
export function operationalOcrStatus(
  validationStatus:ReceiptValidationStatus|null|undefined,
  rawText:string|null|undefined,
):OperationalOcrStatus{
  if(validationStatus==="complete")return"complete";
  if(hasUsefulOcrText(rawText))return"needs_review";
  if(validationStatus==="needs_review")return"needs_review";
  return"failed";
}
