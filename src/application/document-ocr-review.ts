import type { DocumentOcrResult } from "../domain/document-ocr";
import {
  interpretDocumentOcrFinancially,
  OCR_FIELD_TRUST_LABELS,
  type DocumentOcrFinancialInterpretation,
  type OcrFieldTrust,
} from "../domain/document-ocr-financial-interpretation";

export const DOCUMENT_OCR_REVIEW_CONFIDENCE = 0.65;

export type DocumentOcrReviewField = {
  key: keyof Pick<
    DocumentOcrFinancialInterpretation,
    | "issuer"
    | "taxId"
    | "date"
    | "time"
    | "documentNumber"
    | "period"
    | "taxBaseCents"
    | "taxesCents"
    | "totalCents"
    | "paymentMethod"
  >;
  label: string;
  value: string | number | null;
  rawValue: string | null;
  confidence: number | null;
  trust: OcrFieldTrust;
  trustLabel: string;
  evidenceCount: number;
};

export type DocumentOcrReviewSummary = {
  lowConfidenceLines: number;
  emptyPages: number;
  totalLines: number;
  detectedFinancialFields: number;
  doubtfulFinancialFields: number;
  missingFinancialFields: number;
  financialFields: DocumentOcrReviewField[];
  financialWarnings: string[];
  nextAction: "retry" | "review" | "confirm";
  nextActionLabel: string;
  nextActionDetail: string;
};

export type DocumentOcrPageReviewSummary = {
  lowConfidenceLines: DocumentOcrResult["pages"][number]["lines"];
  candidateProductRows: number | null;
  structuredProductRows: number | null;
  unresolvedProductRows: number | null;
  arithmeticRowsChecked: number | null;
  arithmeticRowsMatching: number | null;
  lineTotalMatchesDocumentTotal: boolean | null;
  basePlusTaxMatchesTotal: boolean | null;
  requiresAttention: boolean;
};

export function summarizeDocumentOcrPageReview(page: DocumentOcrResult["pages"][number]): DocumentOcrPageReviewSummary {
  const lowConfidenceLines = page.lines.filter((line) => line.confidence < DOCUMENT_OCR_REVIEW_CONFIDENCE);
  const integrity = page.receiptIntegrity;
  const candidateProductRows = integrity?.candidateProductRows ?? null;
  const structuredProductRows = integrity?.productRows ?? null;
  const unresolvedProductRows = integrity?.unresolvedProductRows ?? null;
  const arithmeticRowsChecked = integrity?.arithmeticRowsChecked ?? null;
  const arithmeticRowsMatching = integrity?.arithmeticRowsMatching ?? null;
  const lineTotalMatchesDocumentTotal = integrity?.lineTotalMatchesDocumentTotal ?? null;
  const basePlusTaxMatchesTotal = integrity?.basePlusTaxMatchesTotal ?? null;
  const integrityNeedsAttention = integrity?.status === "issues" || integrity?.status === "partial" || (unresolvedProductRows ?? 0) > 0;

  return {
    lowConfidenceLines,
    candidateProductRows,
    structuredProductRows,
    unresolvedProductRows,
    arithmeticRowsChecked,
    arithmeticRowsMatching,
    lineTotalMatchesDocumentTotal,
    basePlusTaxMatchesTotal,
    requiresAttention: lowConfidenceLines.length > 0 || integrityNeedsAttention,
  };
}

function reviewFields(interpretation: DocumentOcrFinancialInterpretation): DocumentOcrReviewField[] {
  const definitions = [
    ["issuer", "Comercio / emisor"],
    ["taxId", "CIF / NIF"],
    ["date", "Fecha"],
    ["time", "Hora"],
    ["documentNumber", "Número"],
    ["period", "Periodo"],
    ["taxBaseCents", "Base imponible"],
    ["taxesCents", "Impuestos"],
    ["totalCents", "Total"],
    ["paymentMethod", "Método de pago"],
  ] as const;

  return definitions.map(([key, label]) => {
    const field = interpretation[key];
    return {
      key,
      label,
      value: field.value,
      rawValue: field.rawValue,
      confidence: field.confidence,
      trust: field.trust,
      trustLabel: OCR_FIELD_TRUST_LABELS[field.trust],
      evidenceCount: field.evidence.length,
    };
  });
}

export function summarizeDocumentOcrReview(result: DocumentOcrResult): DocumentOcrReviewSummary {
  const lines = result.pages.flatMap((page) => page.lines);
  const lowConfidenceLines = lines.filter((line) => line.confidence < DOCUMENT_OCR_REVIEW_CONFIDENCE).length;
  const emptyPages = result.pages.filter((page) => !page.plainText.trim()).length;
  const interpretation = interpretDocumentOcrFinancially(result);
  const financialFields = reviewFields(interpretation);
  const detectedFinancialFields = financialFields.filter((field) => field.trust !== "not_detected").length;
  const doubtfulFinancialFields = financialFields.filter((field) => field.trust === "doubtful").length;
  const missingFinancialFields = financialFields.filter((field) => field.trust === "not_detected").length;
  const common = {
    lowConfidenceLines,
    emptyPages,
    totalLines: lines.length,
    detectedFinancialFields,
    doubtfulFinancialFields,
    missingFinancialFields,
    financialFields,
    financialWarnings: interpretation.warnings,
  };

  if (result.status === "empty") {
    return {
      ...common,
      nextAction: "retry",
      nextActionLabel: "Comprueba el original y vuelve a analizar",
      nextActionDetail: "La lectura no contiene texto utilizable. Revisa nitidez, encuadre o el archivo original antes de repetir.",
    };
  }

  if (
    result.status === "needs_review"
    || result.warnings.length
    || lowConfidenceLines > 0
    || doubtfulFinancialFields > 0
    || interpretation.warnings.length > 0
  ) {
    return {
      ...common,
      nextAction: "review",
      nextActionLabel: "Compara la lectura y los campos detectados con el original",
      nextActionDetail: "Hay señales que requieren revisión humana. El OCR bruto se conserva y los datos financieros sólo se confirman mediante la revisión del usuario.",
    };
  }

  return {
    ...common,
    nextAction: "confirm",
    nextActionLabel: "Revisa y confirma los datos detectados",
    nextActionDetail: "Los campos detectados son consistentes, pero siguen siendo datos derivados hasta que el usuario los confirme.",
  };
}
