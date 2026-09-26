from pathlib import Path

path = Path("src/infrastructure/ocr/receipt-padded-cell-consensus-provider.ts")
text = path.read_text()

start = text.index("async function recognizePrepared(")
end = text.index("\n}\n\nconst lexicalKey", start)
block = text[start:end]
marker = """  const recognition = await withTimeout(
    worker.recognize(prepared.bytes, { rotateRadians: 0 }, { text: true, tsv: true }),
    CELL_TIMEOUT_MS,
    \"ocr_padded_cell_timeout\",
  );
"""
if block.count(marker) != 1:
    raise SystemExit("Unexpected recognizePrepared recognition marker")
diagnostic = marker + """  if (kind === \"money\") {
    const rawData = (recognition?.data as unknown as Record<string, unknown>) ?? {};
    console.log(\"CR008_MONEY_RAW\", JSON.stringify({
      variant,
      segmentation: segmentation.name,
      text: normalizedRecognitionText(rawData.text),
      tsv: tsvText(rawData.tsv),
      confidence: rawData.confidence,
      rectangle: prepared.sourceRectangle,
    }));
  }
"""
block = block.replace(marker, diagnostic, 1)
text = text[:start] + block + text[end:]

merge_marker = """      const recovered = choosePaddedNumericConsensus(observations, target.kind);
      if (!recovered) continue;
      consensusCells += 1;
      const existing = existingWordsForCell(words, target.row, target.band, target.kind);
"""
if text.count(merge_marker) != 1:
    raise SystemExit("Unexpected padded consensus merge marker")
merge_diagnostic = """      const recovered = choosePaddedNumericConsensus(observations, target.kind);
      if (target.kind === \"money\") {
        console.log(\"CR008_MONEY_DECISION\", JSON.stringify({
          row: target.row.text,
          reason: target.reason,
          band: { left: target.band.left, right: target.band.right, center: target.band.center },
          observations: observations.map((item) => ({ text: item.word.text, confidence: item.word.confidence, variant: item.variant, segmentation: item.segmentation })),
          recovered: recovered ? { text: recovered.text, confidence: recovered.confidence, box: recovered.box } : null,
        }));
      }
      if (!recovered) continue;
      consensusCells += 1;
      const existing = existingWordsForCell(words, target.row, target.band, target.kind);
"""
text = text.replace(merge_marker, merge_diagnostic, 1)

return_marker = """      return finalWords;
"""
if text.count(return_marker) != 1:
    raise SystemExit(f"Unexpected finalWords return marker count: {text.count(return_marker)}")
text = text.replace(return_marker, """      console.log(\"CR008_FINAL_WORDS\", JSON.stringify(finalWords.map((word) => ({ text: word.text, box: word.box, confidence: word.confidence }))));
      return finalWords;
""", 1)

path.write_text(text)
