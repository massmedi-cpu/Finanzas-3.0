/**
 * Historical candidate 10.0.104 deliberately deferred Documents/OCR.
 * A future full Financial App release must prove all three capabilities are
 * ACTIVE on its exact production SHA, not just present in a preview build.
 * Releases before 10.0.104 retain their historical contract unchanged.
 */
export type ProductionDocumentProfile = Readonly<{
  documents: boolean;
  documentOcr: boolean;
  documentDriveSync: boolean;
}>;

export function expectedProductionDocumentProfile(version: string): ProductionDocumentProfile | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error("invalid_release_version");
  const [major, minor, patch] = match.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    throw new Error("invalid_release_version");
  }
  // The restricted 10.0.104 profile is NEVER considered a full release.
  if (major === 10 && minor === 0 && patch === 104) {
    return { documents: false, documentOcr: false, documentDriveSync: false };
  }
  if (major > 10 || (major === 10 && (minor > 0 || patch >= 105))) {
    return { documents: true, documentOcr: true, documentDriveSync: true };
  }
  return null;
}

export function requiresDualProductionDomainCheck(version: string): boolean {
  return expectedProductionDocumentProfile(version) !== null;
}
