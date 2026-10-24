// REC-G5-345: fail-closed holdout freeze; pure validation without filesystem.
const GIT_SHA = /^[0-9a-f]{40}$/;
const PDF_SHA = /^[0-9a-f]{64}$/;
const safeName = (name: unknown): name is string =>
  typeof name === "string" && name.toLowerCase().endsWith(".pdf")
  && name.length <= 500 && !name.startsWith(".")
  && !/[/\\\x00]/.test(name);
const reject = (): never => { throw new Error("g5_holdout_freeze_invalid"); };

export type G5HoldoutFreeze = Readonly<{
  schemaVersion: 1;
  frozenCommit: string;
  selectedDocuments: ReadonlyArray<Readonly<{
    name: string;
    previouslyInspectedBeforeFreeze: false;
  }>>;
}>;

/** Owner attestation is necessary, but cannot cryptographically prove past access history. */
export function assertG5HoldoutFreeze(
  freeze: unknown, history: unknown, inventory: readonly string[], head: string,
): G5HoldoutFreeze {
  if (!freeze || typeof freeze !== "object" || Array.isArray(freeze)
    || !history || typeof history !== "object" || Array.isArray(history)) reject();
  const f = freeze as Record<string, unknown>;
  const h = history as Record<string, unknown>;
  if (Object.keys(f).sort().join(",") !== "frozenCommit,schemaVersion,selectedDocuments"
    || f.schemaVersion !== 1 || !GIT_SHA.test(head) || f.frozenCommit !== head
    || !Array.isArray(f.selectedDocuments) || f.selectedDocuments.length !== 8
    || inventory.length !== 8
    || Object.keys(h).sort().join(",") !== "documents,schemaVersion"
    || h.schemaVersion !== 1 || !Array.isArray(h.documents)
    || h.documents.length !== 17) reject();
  const inspected = new Set<string>();
  for (const row of h.documents) {
    if (!row || typeof row !== "object" || Array.isArray(row)) reject();
    const o = row as Record<string, unknown>;
    if (Object.keys(o).sort().join(",") !== "name,previouslyInspected,sha256"
      || !safeName(o.name) || typeof o.sha256 !== "string"
      || !PDF_SHA.test(o.sha256) || o.previouslyInspected !== true
      || inspected.has(o.name)) reject();
    inspected.add(o.name);
  }
  const selected = new Set<string>();
  for (const row of f.selectedDocuments) {
    if (!row || typeof row !== "object" || Array.isArray(row)) reject();
    const o = row as Record<string, unknown>;
    if (Object.keys(o).sort().join(",") !== "name,previouslyInspectedBeforeFreeze"
      || !safeName(o.name) || o.previouslyInspectedBeforeFreeze !== false
      || inspected.has(o.name) || selected.has(o.name)) reject();
    selected.add(o.name);
  }
  const seen = new Set<string>();
  for (const name of inventory) {
    if (!safeName(name) || !selected.has(name) || seen.has(name)) reject();
    seen.add(name);
  }
  return f as G5HoldoutFreeze;
}
