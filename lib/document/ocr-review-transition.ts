import { operationalOcrStatus } from "./ocr-operational-status";
import type { ReceiptValidationStatus } from "./receipt-financial-validator";

type OcrReviewTransitionInput={
  existingStatus:unknown;
  incomingStatus:unknown;
  manualReviewConfirmed:boolean;
  newMachineEvidence:boolean;
  reviewSensitiveChanged:boolean;
  validationStatus:ReceiptValidationStatus|null|undefined;
  rawText:string|null|undefined;
};

export function resolveOcrReviewStatus(input:OcrReviewTransitionInput){
  const existing=String(input.existingStatus||"");
  const incoming=String(input.incomingStatus||"");

  if(incoming==="manual"){
    if(input.manualReviewConfirmed)return"manual" as const;
    if(existing==="manual")return null;
    return operationalOcrStatus(input.validationStatus,input.rawText);
  }

  if(input.newMachineEvidence)return operationalOcrStatus(input.validationStatus,input.rawText);

  // Editing machine-derived financial/identity fields is not the same as reviewing them.
  // A previously validated machine result becomes reviewable again until the user
  // explicitly confirms the review. Existing pending/failed states remain unchanged.
  if(input.reviewSensitiveChanged&&existing==="complete")return"needs_review" as const;

  return null;
}
