"use client";

import { useState } from "react";
import { formatNumberWithDigits } from "../../src/core/formatters";
import { summarizeDocumentOcrPageReview } from "../../src/application/document-ocr-review";
import type { DocumentOcrResult } from "../../src/domain/document-ocr";
import styles from "./ocr-review-workbench.module.css";

type OcrPage = DocumentOcrResult["pages"][number];

function checkLabel(value: boolean | null, yes: string, no: string, unknown: string) {
  if (value === null) return unknown;
  return value ? yes : no;
}

export function OcrPageReviewWorkbench({
  page,
  preservesGeometry,
  openingOriginal,
  onOpenOriginal,
}: {
  page: OcrPage;
  preservesGeometry: boolean;
  openingOriginal: boolean;
  onOpenOriginal: () => void;
}) {
  const [traceOpen, setTraceOpen] = useState(false);
  const review = summarizeDocumentOcrPageReview(page);
  const coverageKnown = review.candidateProductRows !== null;
  const coverageLabel = coverageKnown
    ? `${review.structuredProductRows}/${review.candidateProductRows} filas estructuradas`
    : "No aplica";
  const arithmeticLabel = review.arithmeticRowsChecked === null
    ? "No aplica"
    : `${review.arithmeticRowsMatching}/${review.arithmeticRowsChecked} líneas cuadran`;
  const structuredReview = page.reviewText?.trim() ?? "";
  const geometricReview = page.layoutText.trim();
  const hasStructuredReview = Boolean(structuredReview) && structuredReview !== geometricReview;

  return (
    <section className={styles.workbench} data-testid={`ocr-review-workbench-${page.pageNumber}`} aria-label={`Mesa de revisión OCR de la página ${page.pageNumber}`}>
      <div className={styles.workbenchHeader}>
        <div>
          <span>Mesa de revisión · Página {page.pageNumber}</span>
          <strong>{review.requiresAttention ? "Hay puntos concretos que comprobar" : "Sin incidencias internas detectadas"}</strong>
          <p>Contrasta estos indicadores con el original. Ningún importe se corrige ni se guarda automáticamente.</p>
        </div>
        <button className={styles.originalButton} type="button" onClick={onOpenOriginal} disabled={openingOriginal}>
          {openingOriginal ? "Abriendo…" : "Abrir original"}
        </button>
      </div>

      <div className={styles.reviewGrid}>
        <div className={`${styles.reviewCard} ${(review.unresolvedProductRows ?? 0) > 0 ? styles.attention : styles.ok}`}>
          <span>Cobertura de filas</span>
          <strong>{coverageLabel}</strong>
          {review.unresolvedProductRows !== null ? <small>{review.unresolvedProductRows} sin resolver</small> : null}
        </div>
        <div className={`${styles.reviewCard} ${review.lowConfidenceLines.length ? styles.attention : styles.ok}`}>
          <span>Confianza por línea</span>
          <strong>{review.lowConfidenceLines.length ? `${review.lowConfidenceLines.length} a revisar` : "Sin líneas bajo umbral"}</strong>
          <small>Umbral: 65 %</small>
        </div>
        <div className={`${styles.reviewCard} ${review.arithmeticRowsChecked !== null && review.arithmeticRowsMatching !== review.arithmeticRowsChecked ? styles.attention : styles.ok}`}>
          <span>Aritmética de filas</span>
          <strong>{arithmeticLabel}</strong>
          <small>Cantidad × precio = importe</small>
        </div>
        <div className={`${styles.reviewCard} ${review.lineTotalMatchesDocumentTotal === false || review.basePlusTaxMatchesTotal === false || !preservesGeometry ? styles.attention : styles.ok}`}>
          <span>Total y geometría</span>
          <strong>{checkLabel(review.lineTotalMatchesDocumentTotal, "Suma = total", "Suma ≠ total", "Total no comprobable")}</strong>
          <small>{checkLabel(review.basePlusTaxMatchesTotal, "Base + IVA = total", "Base + IVA ≠ total", "Fiscal no comprobable")} · {preservesGeometry ? "geometría estable" : "revisar geometría"}</small>
        </div>
      </div>

      {review.lowConfidenceLines.length ? (
        <div className={styles.lineReview} data-testid={`ocr-low-confidence-${page.pageNumber}`}>
          <strong>Líneas que merecen revisión visual</strong>
          <p>Se muestran literalmente como las devolvió OCR; no se completa ningún dato por contexto.</p>
          <ul className={styles.lineList}>
            {review.lowConfidenceLines.map((line) => (
              <li key={line.id}>
                <span>{formatNumberWithDigits(line.confidence * 100, 0)} %</span>
                <code>{line.text || "(línea vacía)"}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className={styles.emptyAttention}>No hay líneas por debajo del umbral técnico de revisión en esta página.</div>
      )}

      <details
        className={styles.trace}
        data-testid={`ocr-trace-${page.pageNumber}`}
        onToggle={(event) => setTraceOpen(event.currentTarget.open)}
      >
        <summary>Comparar trazabilidad OCR</summary>
        {traceOpen ? (
          <div className={`${styles.traceGrid} ${hasStructuredReview ? styles.traceGridThree : ""}`}>
            {hasStructuredReview ? (
              <div className={styles.tracePane} data-testid={`ocr-trace-structured-${page.pageNumber}`}>
                <strong>Texto estructurado para revisión</strong>
                <pre>{structuredReview}</pre>
                <small>Presentación derivada para facilitar la revisión. No sustituye al OCR bruto.</small>
              </div>
            ) : null}
            <div className={styles.tracePane} data-testid={`ocr-trace-layout-${page.pageNumber}`}>
              <strong>Reconstrucción geométrica</strong>
              <pre>{page.layoutText || page.plainText || "Sin texto"}</pre>
              <small>Distribución reconstruida a partir de la posición de las palabras.</small>
            </div>
            <div className={styles.tracePane} data-testid={`ocr-trace-raw-${page.pageNumber}`}>
              <strong>OCR bruto</strong>
              <pre>{page.plainText || "Sin texto"}</pre>
              <small>Evidencia literal conservada para auditoría y comparación.</small>
            </div>
          </div>
        ) : null}
      </details>
    </section>
  );
}
