/**
 * Public build-time release choice. Keep documents out of a candidate until
 * private-original immutability has been demonstrated in its real backend.
 * Authorization remains independent; every document HTTP entry point also
 * denies access when deferred. An existing stable build is unaffected.
 */
export function isDocumentsDeferred(
  value: string | undefined = process.env.NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DOCUMENTS,
): boolean {
  return value === "deferred";
}

export function isReleaseHrefAvailable(href: string): boolean {
  const pathname = href.split(/[?#]/, 1)[0];
  return !isDocumentsDeferred() || (pathname !== "/documents" && !pathname.startsWith("/documents/"));
}
