from pathlib import Path

path = Path("src/infrastructure/ocr/receipt-anchor-filter-provider.ts")
text = path.read_text()

old1 = '''  let startIndex = metadataIndexes.length
    ? Math.min(...metadataIndexes)
    : Math.max(0, header.startIndex - 2);
  let precedingIndex = startIndex - 1;
  // A merchant name can wrap its last letter onto a short line. Keep both
  // lines when they are adjacent; fixing row grouping must not crop the title.
  if (precedingIndex >= 1) {
    const fragment = rows[precedingIndex];
    const title = rows[precedingIndex - 1];
    const gap = fragment.box.y - (title.box.y + title.box.height);
    if (alphaChars(fragment.text) > 0 && alphaChars(fragment.text) < 3
      && !/\\d/.test(fragment.text)
      && intersectsHorizontalBand(fragment, left, right)
      && gap <= Math.max(0.02, title.box.height * 1.5)) {
      precedingIndex -= 1;
    }
  }
'''
new1 = '''  let startIndex = metadataIndexes.length
    ? Math.min(...metadataIndexes)
    : Math.max(0, header.startIndex - 2);
  let precedingIndex = startIndex - 1;
  let titleAdjacencyReference = rows[startIndex];
  // A merchant name can wrap its last letter onto a short line. Keep the
  // complete title only when title -> fragment -> metadata is one contiguous
  // physical chain; this avoids reopening the crop to distant background text.
  if (precedingIndex >= 1) {
    const fragment = rows[precedingIndex];
    const title = rows[precedingIndex - 1];
    const titleGap = fragment.box.y - (title.box.y + title.box.height);
    const metadataGap = rows[startIndex].box.y - (fragment.box.y + fragment.box.height);
    if (alphaChars(fragment.text) > 0 && alphaChars(fragment.text) < 3
      && !/\\d/.test(fragment.text)
      && intersectsHorizontalBand(fragment, left, right)
      && titleGap <= Math.max(0.02, title.box.height * 1.5)
      && metadataGap <= Math.max(0.028, Math.max(fragment.box.height, rows[startIndex].box.height) * 1.8)) {
      precedingIndex -= 1;
      titleAdjacencyReference = fragment;
    }
  }
'''
if text.count(old1) != 1:
    raise SystemExit("Unexpected wrapped-title block")
text = text.replace(old1, new1, 1)

old2 = '''    const candidateTitle = rows[precedingIndex];
    const firstMetadata = rows[startIndex];
    const gap = firstMetadata.box.y - (candidateTitle.box.y + candidateTitle.box.height);
    const adjacentTitle = gap <= Math.max(
      0.028,
      Math.max(candidateTitle.box.height, firstMetadata.box.height) * 1.8,
    );'''
new2 = '''    const candidateTitle = rows[precedingIndex];
    const gap = titleAdjacencyReference.box.y - (candidateTitle.box.y + candidateTitle.box.height);
    const adjacentTitle = gap <= Math.max(
      0.028,
      Math.max(candidateTitle.box.height, titleAdjacencyReference.box.height) * 1.8,
    );'''
if text.count(old2) != 1:
    raise SystemExit("Unexpected title-adjacency block")
path.write_text(text.replace(old2, new2, 1))
