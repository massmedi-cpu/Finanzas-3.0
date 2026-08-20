export const SESSION_COOKIE = 'finanzas_bridge_token';

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Performs a cheap structural/expiry check before allowing a request into the
 * private application shell. The backend remains authoritative for the HMAC
 * signature; this only prevents obviously malformed or expired cookies from
 * producing a broken private page.
 */
export function hasUsableSessionToken(token: string | null | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expRaw, scope, signature] = parts;
  const exp = Number(expRaw);
  return scope === 'firebase' && Boolean(signature) && Number.isFinite(exp) && exp > nowSeconds;
}
