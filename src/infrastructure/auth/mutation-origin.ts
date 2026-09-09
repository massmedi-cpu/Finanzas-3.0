const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizedHeader(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function originMatchesRequest(origin: string, requestUrl: string) {
  try {
    return new URL(origin).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

export function isUnsafeHttpMethod(method: string) {
  return !SAFE_METHODS.has(method.trim().toUpperCase());
}

export function shouldRejectCrossSiteMutation(input: {
  method: string;
  requestUrl: string;
  origin: string | null;
  secFetchSite: string | null;
}) {
  if (!isUnsafeHttpMethod(input.method)) return false;

  const fetchSite = normalizedHeader(input.secFetchSite);
  const origin = input.origin?.trim() ?? "";

  // Modern browsers emit Sec-Fetch-Site for navigations/fetches. A cross-site
  // mutation is never a legitimate Financial App browser request.
  if (fetchSite === "cross-site") return true;

  // When Origin is present it is authoritative for same-origin enforcement.
  // Opaque/invalid origins fail closed.
  if (origin && !originMatchesRequest(origin, input.requestUrl)) return true;

  // `same-site` can still be a different origin (for example a sibling
  // subdomain). Require an explicit matching Origin before accepting it.
  if (fetchSite === "same-site" && !origin) return true;

  // Missing browser metadata is intentionally accepted for authenticated
  // server-to-server/CLI calls. Browser CSRF requests carry Origin and/or
  // Sec-Fetch-Site and are handled above.
  return false;
}
