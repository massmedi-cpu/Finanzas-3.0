/**
 * Only an explicit, persisted note asserting synthetic fixture provenance
 * triggers a warning. This is NOT a confirmed "test" designation and must
 * never silently hide documents from alerts/review or change bank/source data.
 */
export function hasExplicitSyntheticDocumentNote(notes: string | null | undefined): boolean {
  return typeof notes === "string" && /^fixture\s+sint[eé]tico(?=\s|[:.,;—–-]|$)/iu.test(notes.trim());
}
