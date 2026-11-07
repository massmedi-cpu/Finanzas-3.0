/**
 * Parses canonical, bounded decimal query parameters for the document APIs.
 * Empty strings, spaces, signs, leading zeroes and non-decimal notation
 * are never silently normalized into a different request.
 */
export function parseDocumentQueryInteger(
  raw: string | null,
  errorCode: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null) return fallback;
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) throw new Error(errorCode);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(errorCode);
  }
  return value;
}
