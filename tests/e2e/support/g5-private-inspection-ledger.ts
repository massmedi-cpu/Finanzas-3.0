// REC-G5-319. Pure verifier. No filesystem, bank account, PDF content or path.
type LedgerRow = { name?: unknown; previouslyInspected?: unknown; sha256?: unknown };
type ObservedPdf = { name: string; sha256: string };
export function assertInspectedG5Ledger(ledger: unknown, observed: readonly ObservedPdf[]): void {
  const fail = (): never => { throw new Error("g5_private_inspection_ledger_invalid"); };
  const value = ledger as { schemaVersion?: unknown; documents?: unknown };
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.documents)
    || value.documents.length !== 17 || observed.length !== 17) fail();
  const expected = new Map<string,string>();
  for (const row of value.documents as LedgerRow[]) {
    if (!row || typeof row.name !== "string" || !row.name.toLowerCase().endsWith(".pdf")
      || row.name.startsWith(".") || /[/\\\x00]/.test(row.name)
      || row.previouslyInspected !== true || typeof row.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(row.sha256) || expected.has(row.name)) fail();
    expected.set(row.name,row.sha256);
  }
  const encountered = new Set<string>();
  for (const file of observed) {
    if (!file || typeof file.name !== "string" || encountered.has(file.name)
      || !/^[a-f0-9]{64}$/.test(file.sha256)
      || expected.get(file.name) !== file.sha256) fail();
    encountered.add(file.name);
  }
}
