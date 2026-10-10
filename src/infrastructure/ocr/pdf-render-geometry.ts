/** Pure geometry policy for PDF page rasterization prior to OCR. */
export function pdfRasterScale(width: number, height: number, maxSide = 2800, maxScale = 2.5) {
  if (![width, height, maxSide, maxScale].every((value) =>
    Number.isFinite(value) && value > 0
  )) throw new Error("ocr_pdf_page_dimensions_invalid");
  const longest = Math.max(width, height);
  // Never impose a minimum scale: on oversized PDFs it would bypass maxSide
  // and allocate a potentially huge canvas. A small page should instead be
  // rasterized up to maxScale to make OCR usable.
  const scale = Math.min(maxScale, maxSide / longest);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("ocr_pdf_page_dimensions_invalid");
  return scale;
}
