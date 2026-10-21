import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const MAX_PRIVATE_ROOTS = 12;
const REJECT_NON_RECEIPTS = /\b(?:contrato|condiciones|solicitud|p[oó]liza|oferta|certificado)\b/i;
const SPECS = [
  { key: "suministros", match: /emasesa|endesa|energ[ií]a|electric|iberdrola|naturgy|factura\s+agua|luz/i, dev: 4, hold: 2 },
  { key: "telecom", match: /vodafone|movistar|orange|yoigo|digi|telefon|fibra|telecom/i, dev: 2, hold: 1 },
  { key: "supermercado", match: /carrefour|mercadona|lidl|dia\b|supermerc|aldi/i, dev: 6, hold: 2 },
  { key: "transporte", match: /renfe|uber|cabify|parking|combustible|gasolina|repsol|cepsa|bp\s/i, dev: 1, hold: 1 },
  { key: "tecnologia", match: /amazon|mediamarkt|pccomponentes|fnac|aliexpress|tecnolog/i, dev: 1, hold: 1 },
  { key: "otros", match: /.*/, dev: 2, hold: 1 },
];
const die = (code) => { throw new Error(code); };
const assertPrivateId = (value) => typeof value === "string" && DRIVE_ID.test(value);
const classOf = (fileName) => SPECS.find((x) => x.match.test(fileName))?.key ?? "otros";

// Caller must provide owner-private Drive metadata obtained outside CI.
// Do not print file names, IDs, document bytes, or identifiers in logs/errors.
export function selectPrivateOcrCorpus(files) {
  if (!Array.isArray(files) || files.length < 24 || files.length > 2000)
    die("g5_private_corpus_invalid_size");
  const byId = new Map();
  for (const f of files) {
    if (!f || !assertPrivateId(f.id) || byId.has(f.id))
      die("g5_private_catalog_duplicate_or_invalid_id");
    byId.set(f.id, f);
  }
  const choices = new Map(SPECS.map((x) => [x.key, []]));
  const inspected = new Set();
  for (const file of files) {
    if (file.previouslyInspected === true) inspected.add(file.id);
    if (file.private !== true || file.mimeType !== "application/pdf"
      || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1000
      || !assertPrivateId(file.parentFolderId)
      || typeof file.name !== "string" || REJECT_NON_RECEIPTS.test(file.name)) continue;
    choices.get(classOf(file.name)).push(file);
  }
  if (inspected.size > 16) die("g5_private_inspection_exceeds_development_quota");
  for (const id of inspected) {
    if (!Array.from(choices.values()).some((bucket) => bucket.some((f) => f.id === id)))
      die("g5_private_inspected_document_ineligible");
  }

  const allValid = [...choices.values()].flat();
  const folderCounts = new Map();
  for (const f of allValid) folderCounts.set(f.parentFolderId, (folderCounts.get(f.parentFolderId) ?? 0) + 1);
  const selected = new Map();
  const usedFolders = new Set();
  for (const f of allValid.filter((x) => inspected.has(x.id))) {
    selected.set(f.id, { file: f, holdout: false, kind: classOf(f.name) });
    usedFolders.add(f.parentFolderId);
  }

  const ranked = (a, b) =>
    Number(usedFolders.has(b.parentFolderId)) - Number(usedFolders.has(a.parentFolderId))
    || (folderCounts.get(b.parentFolderId) ?? 0) - (folderCounts.get(a.parentFolderId) ?? 0)
    || a.sizeBytes - b.sizeBytes || a.id.localeCompare(b.id);

  const selectN = (spec, holdout, count) => {
    while ([...selected.values()].filter((x) => x.kind === spec.key && x.holdout === holdout).length < count) {
      const candidate = choices.get(spec.key).filter((f) => !selected.has(f.id)).sort(ranked)[0];
      if (!candidate) die("g5_private_quota_unreachable");
      selected.set(candidate.id, { file: candidate, kind: spec.key, holdout });
      usedFolders.add(candidate.parentFolderId);
    }
  };
  // Fill development per scarcest class first, protecting previously inspected
  // files. Holdout is selected ONLY from unopened private PDFs.
  for (const spec of [...SPECS].sort((a, b) => choices.get(a.key).length - choices.get(b.key).length))
    selectN(spec, false, spec.dev);
  for (const spec of SPECS) selectN(spec, true, spec.hold);

  const values = [...selected.values()];
  const development = values.filter((x) => !x.holdout);
  const holdout = values.filter((x) => x.holdout);
  if (development.length !== 16 || holdout.length !== 8 || usedFolders.size > MAX_PRIVATE_ROOTS
    || holdout.some((x) => inspected.has(x.file.id))
    || new Set(values.map((x) => x.file.id)).size !== 24)
    die("g5_private_corpus_isolation_or_root_limit");
  return {
    development, holdout, folderCount: usedFolders.size,
    counts: SPECS.map((x) => ({ kind: x.key,
      development: development.filter((v) => v.kind === x.key).length,
      holdout: holdout.filter((v) => v.kind === x.key).length })),
  };
}

// No real Drive metadata, IDs, filenames or PDF bytes ever enter GitHub CI.
function testSynthetic() {
  const samples = [];
  const tokens = ["Factura Energia", "Factura Vodafone", "Mercadona ticket",
    "Factura Cabify", "Factura MediaMarkt", "Factura independiente"];
  const counts = [7, 5, 10, 4, 3, 5];
  for (let group = 0; group < counts.length; group++) {
    for (let i = 0; i < counts[group]; i++) {
      samples.push({
        id: "synthetic_" + String(group).padStart(2, "0") + String(i).padStart(8, "0"),
        parentFolderId: "folder_private_" + String(group).padStart(2, "0"),
        name: tokens[group] + " " + i + ".pdf",
        mimeType: "application/pdf", sizeBytes: 2500 + i,
        private: true, previouslyInspected: i === 0,
      });
    }
  }
  samples.push({
    id: "synthetic_contract_001", parentFolderId: "folder_private_00",
    name: "Contrato de suministro Energia.pdf", mimeType: "application/pdf",
    sizeBytes: 3000, private: true,
  });
  samples.push({
    id: "synthetic_public_001", parentFolderId: "folder_private_01",
    name: "Factura Vodafone compartida.pdf", mimeType: "application/pdf",
    sizeBytes: 3000, private: false,
  });
  const good = selectPrivateOcrCorpus(samples);
  assert.equal(good.development.length, 16);
  assert.equal(good.holdout.length, 8);
  assert.equal(good.folderCount, 6);
  assert.equal(new Set([...good.development, ...good.holdout].map((x) => x.file.id)).size, 24);
  assert.equal(good.holdout.some((x) => x.file.previouslyInspected), false);
  assert.equal([...good.development, ...good.holdout].some((x) => REJECT_NON_RECEIPTS.test(x.file.name)), false);
  assert.equal([...good.development, ...good.holdout].some((x) => x.file.private !== true), false);
  assert.throws(() => selectPrivateOcrCorpus([...samples, samples[0]]), /g5_private_catalog_duplicate_or_invalid_id/);
  assert.throws(() => selectPrivateOcrCorpus(samples.filter((x) => !x.name.includes("Mercadona"))),
    /g5_private_quota_unreachable/);
  assert.throws(() => selectPrivateOcrCorpus(samples.map((x, i) => ({
    ...x, parentFolderId: "folder_private_" + String(i).padStart(3, "0"),
  }))), /g5_private_corpus_isolation_or_root_limit/);
  assert.throws(() => selectPrivateOcrCorpus(samples.map((x) => ({
    ...x, previouslyInspected: true,
  }))), /g5_private_inspection_exceeds_development_quota/);
  process.stdout.write("REC_G5_PRIVATE_CORPUS|status=ok|development=16|holdout=8|roots_limit=12|synthetic_only=true|document_values_logged=false\n");
}

if (process.argv[1]?.endsWith("verify-private-ocr-corpus-selection.mjs")) {
  if (process.argv[2] === "--self-test") testSynthetic();
  else if (process.argv[2] === "--metadata" && process.argv[3]) {
    // A local/private metadata file only; never check it into a repository.
    const plan = selectPrivateOcrCorpus(JSON.parse(readFileSync(process.argv[3], "utf8")));
    process.stdout.write("REC_G5_PRIVATE_CORPUS|status=ok|development=" + plan.development.length
      + "|holdout=" + plan.holdout.length + "|folder_roots=" + plan.folderCount
      + "|identities_logged=false|data_uploaded=false\n");
  } else die("g5_private_corpus_usage");
}
