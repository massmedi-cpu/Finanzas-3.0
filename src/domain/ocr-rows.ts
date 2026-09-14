import type { OcrBoundingBox, OcrWord } from "./document-ocr";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const centerY = (word: OcrWord): number => word.box.y + word.box.height / 2;

/**
 * Group by typical glyph centres, never by a growing union box. Read regular
 * glyphs first so a tall shadow cannot seed a row that absorbs its neighbours.
 * Words, confidence, punctuation and source coordinates remain unchanged.
 */
export function clusterOcrRows(words: OcrWord[]): OcrWord[][] {
  if (!words.length) return [];
  const typicalHeight = median(words.map((word) => word.box.height));
  const regular = (word: OcrWord) => word.box.height >= typicalHeight * 0.45
    && word.box.height <= typicalHeight * 1.8;
  const byCenter = (a: OcrWord, b: OcrWord) => centerY(a) - centerY(b) || a.box.x - b.box.x;
  const ordered = [
    ...words.filter(regular).sort(byCenter),
    ...words.filter((word) => !regular(word)).sort(byCenter),
  ];
  const rows: OcrWord[][] = [];
  for (const word of ordered) {
    let closest: OcrWord[] | undefined;
    let distance = Infinity;
    for (const row of rows) {
      const height = median(row.map((item) => item.box.height));
      const referenceHeight = regular(word)
        ? Math.max(height, Math.min(word.box.height, height * 1.5))
        : Math.min(height, word.box.height);
      const next = Math.abs(centerY(word) - median(row.map(centerY)));
      if (next <= referenceHeight * 0.62 && next < distance) {
        closest = row;
        distance = next;
      }
    }
    if (closest) closest.push(word);
    else rows.push([word]);
  }
  return rows
    .sort((a, b) => median(a.map(centerY)) - median(b.map(centerY)))
    .map((row) => row.sort((a, b) => a.box.x - b.box.x));
}

/** Geometry used for image crops; outlier marks must not enlarge a text line. */
export function ocrRowTextBox(words: OcrWord[]): OcrBoundingBox {
  if (!words.length) throw new Error("ocr_empty_row");
  const height = median(words.map((word) => word.box.height));
  const regular = words.filter((word) => word.box.height >= height * 0.5
    && word.box.height <= height * 1.7);
  const source = regular.length ? regular : words;
  const left = Math.min(...source.map((word) => word.box.x));
  const right = Math.max(...source.map((word) => word.box.x + word.box.width));
  const top = Math.min(...source.map((word) => word.box.y));
  const bottom = Math.max(...source.map((word) => word.box.y + word.box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
