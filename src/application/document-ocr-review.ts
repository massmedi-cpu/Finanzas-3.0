import type { DocumentOcrResult } from "../domain/document-ocr";

const REVIEW_CONFIDENCE = 0.65;

export type DocumentOcrReviewSummary = {
  lowConfidenceLines: number;
  emptyPages: number;
  totalLines: number;
  nextAction: "retry" | "review" | "confirm";
  nextActionLabel: string;
  nextActionDetail: string;
};

export function summarizeDocumentOcrReview(result: DocumentOcrResult): DocumentOcrReviewSummary {
  const lines = result.pages.flatMap((page) => page.lines);
  const lowConfidenceLines = lines.filter((line) => line.confidence < REVIEW_CONFIDENCE).length;
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
