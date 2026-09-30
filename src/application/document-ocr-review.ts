import type { DocumentOcrResult } from "../domain/document-ocr";

export const DOCUMENT_OCR_REVIEW_CONFIDENCE = 0.65;

export type DocumentOcrReviewSummary = {
  lowConfidenceLines: number;
  emptyPages: number;
  totalLines: number;
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

export function summarizeDocumentOcrReview(result: DocumentOcrResult): DocumentOcrReviewSummary {
  const lines = result.pages.flatMap((page) => page.lines);
  const lowConfidenceLines = lines.filter((line) => line.confidence < DOCUMENT_OCR_REVIEW_CONFIDENCE).length;
  const emptyPages = result.pages.filter((page) => !page.plainText.trim()).length;

  if (result.status === "empty") {
    return {
      lowConfidenceLines,
      emptyPages,
      totalLines: lines.length,
      nextAction: "retry",
      nextActionLabel: "Comprueba el original y vuelve a analizar",
      nextActionDetail: "La lectura no contiene texto utilizable. Revisa nitidez, encuadre o el archivo original antes de repetir.",
    };
  }

  if (result.status === "needs_review" || result.warnings.length || lowConfidenceLines > 0) {
    return {
      lowConfidenceLines,
      emptyPages,
      totalLines: lines.length,
      nextAction: "review",
      nextActionLabel: "Compara la lectura con el original",
      nextActionDetail: "Hay señales que requieren revisión humana. Nada se copiará a los datos del documento automáticamente.",
    };
  }

  return {
    lowConfidenceLines,
    emptyPages,
    totalLines: lines.length,
    nextAction: "confirm",
    nextActionLabel: "Revisa y completa los datos del documento",
    nextActionDetail: "La lectura es consistente, pero fecha, emisor e importe sólo se guardan cuando tú los confirmas en el formulario.",
  };
}
