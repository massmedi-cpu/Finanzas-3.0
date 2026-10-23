import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const MAX_PRIVATE_ROOTS = 12;
const ACCEPT_RECEIPTS = /facturas?|tickets?|recibos?|justificantes?|comprobantes?|invoices?|receipts?|compras?|pedidos?/i;
const REJECT_NON_RECEIPTS = /\b(?:contratos?|condiciones|solicitudes?|p[oó]lizas?|ofertas?|certificados?|contracts?|terms\s+(?:and\s+)?conditions)\b/i;
const SPECS = [
  { key: "suministros", match: /emasesa|endesa|energ[ií]a|electric|iberdrola|naturgy|factura\s+agua|luz/i, dev: 4, hold: 2 },
  { key: "telecom", match: /vodafone|movistar|orange|yoigo|digi|telefon|fibra|telecom/i, dev: 2, hold: 1 },
  { key: "supermercado", match: /carrefour|mercadona|lidl|\bdia\b|supermerc|aldi/i, dev: 6, hold: 2 },
  { key: "transporte", match: /renfe|uber|cabify|free[\s-]*now|freenow|taxi|parking|combustible|gasolina|repsol|cepsa|bp\s/i, dev: 3, hold: 1 },
  { key: "tecnologia", match: /amazon|media\s*markt|pccomponentes|fnac|aliexpress|samsung|xiaomi|tecnolog/i, dev: 1, hold: 1 },
  { key: "otros", match: /.*/, dev: 1, hold: 1 },
];
const die = (code) => { throw new Error(code); };
const assertPrivateId = (value) => typeof value === "string" && DRIVE_ID.test(value);
const classOf = (fileName) => SPECS.find((x) => x.match.test(fileName))?.key ?? "otros";

// Caller must provide owner-private Drive metadata obtained outside CI.
// Do not print file names, IDs, document bytes, or identifiers in logs/errors.
export function selectPrivateOcrCorpus(files) {
  if (!Array.isArray(files) || files.length < 25 || files.length > 2000)
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
      || typeof file.name !== "string" || !ACCEPT_RECEIPTS.test(file.name)
      || REJECT_NON_RECEIPTS.test(file.name)) continue;
    // Unknown inspection history must never be interpreted as unopened.
    // This private field is supplied by the owner's local inspection ledger.
    if (typeof file.previouslyInspected !== "boolean")
      die("g5_private_inspection_state_required");
    choices.get(classOf(file.name)).push(file);
  }
  for (const id of inspected) {
    if (!Array.from(choices.values()).some((bucket) => bucket.some((f) => f.id === id)))
      die("g5_private_inspected_document_ineligible");
  }

  // REC-G5-362: 17 development originals and 8 untouched holdout PDFs.
  // A 16/8 selector silently underfilled the separate 17-document runner.
  assert.equal(SPECS.reduce((sum, spec) => sum + spec.dev, 0), 17);
  assert.equal(SPECS.reduce((sum, spec) => sum + spec.hold, 0), 8);
  const allValid = [...choices.values()].flat();
  const folderCounts = new Map();
  for (const f of allValid) folderCounts.set(f.parentFolderId, (folderCounts.get(f.parentFolderId) ?? 0) + 1);
  const selected = new Map();
  const usedFolders = new Set();
  const ranked = (a, b) =>
    Number(usedFolders.has(b.parentFolderId)) - Number(usedFolders.has(a.parentFolderId))
    || (folderCounts.get(b.parentFolderId) ?? 0) - (folderCounts.get(a.parentFolderId) ?? 0)
    || a.sizeBytes - b.sizeBytes || a.id.localeCompare(b.id);

  // A corrected merchant category can place multiple previously opened PDFs
  // in a class with a development quota of one. Keep at most the class quota;
  // unused opened PDFs stay excluded from BOTH sets, never enter holdout.
  for (const spec of SPECS) {
    const seen = choices.get(spec.key).filter((f) => inspected.has(f.id)).sort(ranked).slice(0, spec.dev);
    for (const file of seen) {
      selected.set(file.id, { file, holdout: false, kind: spec.key });
      usedFolders.add(file.parentFolderId);
    }
  }
  const selectN = (spec, holdout, count) => {
    while ([...selected.values()].filter((x) => x.kind === spec.key && x.holdout === holdout).length < count) {
      const candidate = choices.get(spec.key)
        .filter((f) => !selected.has(f.id) && (!holdout || f.previouslyInspected === false))
        .sort(ranked)[0];
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
  if (development.length !== 17 || holdout.length !== 8 || usedFolders.size > MAX_PRIVATE_ROOTS
    || holdout.some((x) => inspected.has(x.file.id))
    || new Set(values.map((x) => x.file.id)).size !== 25)
    die("g5_private_corpus_isolation_or_root_limit");
  const excludedInspectedCount = inspected.size
    - development.filter((x) => inspected.has(x.file.id)).length;
  return {
    development, holdout, folderCount: usedFolders.size,
    excludedInspectedCount,
    counts: SPECS.map((x) => ({ kind: x.key,
      development: development.filter((v) => v.kind === x.key).length,
      holdout: holdout.filter((v) => v.kind === x.key).length })),
  };
}

// No real Drive metadata, IDs, filenames or PDF bytes ever enter GitHub CI.
function testSynthetic() {
  const samples = [];
  const tokens = ["Factura Energia", "Factura Vodafone", "Mercadona ticket",
    "Factura Cabify", "Factura Media Markt", "Factura independiente"];
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
  // Invalid-document variants must stay excluded even when classification
  // keywords would otherwise place them into an invoice category.
  for (const [suffix, name] of [
    ["plural_001", "Contratos de suministro Energia.pdf"],
    ["plural_002", "Factura de ofertas comerciales.pdf"],
    ["english_01", "Service contract.pdf"],
  ]) {
    samples.push({
      id: "synthetic_" + suffix + "000000",
      parentFolderId: "folder_private_00",
      name,
      mimeType: "application/pdf",
      sizeBytes: 3200,
      private: true,
    });
  }
  samples.push({
    id: "synthetic_mediamarkt_0001",
    parentFolderId: "folder_private_04",
    name: "Factura MediaMarkt distinta.pdf",
    mimeType: "application/pdf",
    sizeBytes: 3500,
    private: true, previouslyInspected: false,
  });
  // REC-G5-304: check real-world vendor aliases with synthetic names only.
  assert.equal(classOf("2019-10-31 - FREE NOW - Factura ejemplo.pdf"), "transporte");
  assert.equal(classOf("Factura FreeNow taxi ejemplo.pdf"), "transporte");
  assert.equal(classOf("2024-07-31 - Samsung - Factura ejemplo.pdf"), "tecnologia");
  assert.equal(classOf("Ticket Xiaomi ejemplo.pdf"), "tecnologia");
  // REC-G5-305: a generic PDF is not a receipt just because its name matches a merchant.
  // Explicitly non-receipt filenames stay out of the real sample.
  const otherGeneric = {
    id: "synthetic_non_invoice_000000", parentFolderId: "folder_private_05",
    name: "Resumen de cuenta bancaria.pdf",
    mimeType: "application/pdf", sizeBytes: 2500, private: true,
  };
  const good = selectPrivateOcrCorpus([...samples, otherGeneric]);
  assert.ok(![...good.development, ...good.holdout].some((entry) => entry.file.id === "synthetic_non_invoice_000000"));
  assert.equal(good.development.length, 17);
  assert.equal(good.holdout.length, 8);
  assert.equal(good.folderCount, 6);
  assert.deepEqual(good.counts.map((x) => [x.development, x.holdout]),
    [[4, 2], [2, 1], [6, 2], [3, 1], [1, 1], [1, 1]]);
  assert.equal(new Set([...good.development, ...good.holdout].map((x) => x.file.id)).size, 25);
  assert.equal(good.holdout.some((x) => x.file.previouslyInspected), false);
  assert.equal([...good.development, ...good.holdout].some((x) => REJECT_NON_RECEIPTS.test(x.file.name)), false);
  assert.equal([...good.development, ...good.holdout].some((x) => x.file.private !== true), false);
  assert.throws(() => selectPrivateOcrCorpus([...samples, samples[0]]), /g5_private_catalog_duplicate_or_invalid_id/);
  assert.throws(() => selectPrivateOcrCorpus(samples.filter((x) => !x.name.includes("Mercadona"))),
    /g5_private_quota_unreachable/);
  assert.throws(() => selectPrivateOcrCorpus(samples.map((x, i) => ({
    ...x, parentFolderId: "folder_private_" + String(i).padStart(3, "0"),
  }))), /g5_private_corpus_isolation_or_root_limit/);
  // REC-G5-307: overquota inspected PDFs are excluded, NEVER reclassified as holdout.
  const overQuota = samples.map((x) => ({
    ...x, previouslyInspected: x.previouslyInspected === true
      || x.name === "Factura Cabify 1.pdf"
      || x.name === "Factura Media Markt 1.pdf",
  }));
  const recovered = selectPrivateOcrCorpus(overQuota);
  assert.equal(recovered.development.length, 17);
  assert.equal(recovered.holdout.length, 8);
  assert.equal(recovered.excludedInspectedCount, 1);
  assert.equal(recovered.holdout.some((x) => x.file.previouslyInspected), false);
  assert.equal(recovered.development.filter((x) => x.kind === "transporte").length, 3);
  assert.equal(recovered.development.filter((x) => x.kind === "tecnologia").length, 1);
  assert.equal(recovered.development.filter((x) => x.kind === "otros").length, 1);
  // REC-G5-363: match the owner-private, anonymized 22/10 audit: exactly
  // 17 ALREADY-INSPECTED PDFs in six classes (4,2,6,3,1,1).
  // The selector must preserve all seventeen and allocate eight untouched
  // holdout documents; it may not replace inspected transport with a fresh
  // supermarket development sample merely to satisfy a synthetic quota.
  const inspectedCounts = [4, 2, 6, 3, 1, 1];
  const historic = samples.map((file) => {
    const group = tokens.findIndex((prefix) => file.name.startsWith(prefix + " "));
    if (group < 0) return file;
    const index = Number(file.name.slice(tokens[group].length + 1).split(".")[0]);
    return { ...file, previouslyInspected: index < inspectedCounts[group] };
  });
  const historicalSelection = selectPrivateOcrCorpus(historic);
  assert.equal(historicalSelection.development.length, 17);
  assert.equal(historicalSelection.holdout.length, 8);
  assert.equal(historicalSelection.excludedInspectedCount, 0);
  assert.equal(historicalSelection.development.every((x) => x.file.previouslyInspected), true);
  assert.equal(historicalSelection.holdout.every((x) => !x.file.previouslyInspected), true);
  assert.deepEqual(historicalSelection.counts.map((x) => [x.development, x.holdout]),
    [[4, 2], [2, 1], [6, 2], [3, 1], [1, 1], [1, 1]]);
  // More than 17 inspected overall is acceptable IF holdout remains unopened.
  const openedCounts = [4, 2, 6, 3, 2, 1];
  const manyOpened = samples.map((x) => {
    const group = tokens.findIndex((prefix) => x.name.startsWith(prefix + " "));
    if (group < 0) return x;
    const index = Number(x.name.slice(tokens[group].length + 1).split(".")[0]);
    return { ...x, previouslyInspected: index < openedCounts[group] };
  });
  const manyResult = selectPrivateOcrCorpus(manyOpened);
  assert.equal(manyResult.development.length, 17);
  assert.equal(manyResult.holdout.length, 8);
  assert.equal(manyResult.excludedInspectedCount, 1);
  assert.equal(manyResult.holdout.some((x) => x.file.previouslyInspected), false);
  // A 24-document inventory can no longer masquerade as the 17+8 gate.
  assert.throws(() => selectPrivateOcrCorpus(
    [...good.development, ...good.holdout].slice(0, 24).map((entry) => entry.file),
  ), /g5_private_corpus_invalid_size/);
  // Missing explicit inspection state must fail closed, not silently enter holdout.
  assert.throws(() => selectPrivateOcrCorpus(samples.map((x, i) =>
    i === 1 ? { ...x, previouslyInspected: undefined } : x)), /g5_private_inspection_state_required/);
  // An inspected but ineligible contract is rejected before any quota check.
  assert.throws(() => selectPrivateOcrCorpus(samples.map((x) => ({
    ...x, previouslyInspected: x.name === "Contrato de suministro Energia.pdf" ? true : x.previouslyInspected,
  }))), /g5_private_inspected_document_ineligible/);
  // Only genuinely eligible PDFs can be marked opened. With all of those
  // inspected, the holdout has no untouched candidates and must fail closed.
  assert.throws(() => selectPrivateOcrCorpus(samples.map((x) => ({
    ...x, previouslyInspected: x.private === true
      && ACCEPT_RECEIPTS.test(x.name) && !REJECT_NON_RECEIPTS.test(x.name)
      ? true : x.previouslyInspected,
  }))), /g5_private_quota_unreachable/);
  process.stdout.write("REC_G5_PRIVATE_CORPUS|status=ok|development=17|holdout=8|roots_limit=12|synthetic_only=true|document_values_logged=false\n");
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
