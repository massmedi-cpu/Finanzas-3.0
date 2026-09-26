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
path.write_text(text[:start] + block + text[end:])
