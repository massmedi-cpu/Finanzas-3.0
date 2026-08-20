export const SESSION_COOKIE = 'finanzas_session';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isAccessProtectionConfigured(): boolean {
  return Boolean(process.env.APP_ACCESS_PASSWORD?.trim() && process.env.APP_SESSION_SECRET?.trim());
}

export async function createSessionToken(password: string, secret: string): Promise<string> {
  const input = new TextEncoder().encode(`finanzas-3.0|${password}|${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return bytesToHex(new Uint8Array(digest));
}

export async function expectedSessionToken(): Promise<string | null> {
  const password = process.env.APP_ACCESS_PASSWORD?.trim();
  const secret = process.env.APP_SESSION_SECRET?.trim();
  if (!password || !secret) return null;
  return createSessionToken(password, secret);
}
