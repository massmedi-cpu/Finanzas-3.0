/**
 * REC-REL-424: use the isolated, SHA-matched candidate Edge function only for
 * the protected release branch's Vercel preview. All other previews and the
 * production deployment retain the established production gateway.
 *
 * The Edge runtime independently denies preview writes to financial data.
 * A browser-controlled value must never choose this service endpoint.
 */
export function resolveGatewayTarget(
  productionGatewayUrl: string,
  candidateGatewayUrl: string,
  env: Readonly<{ VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string }>,
): string {
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "chat/integrated-b-e-c-visual-20261010"
    ? candidateGatewayUrl
    : productionGatewayUrl;
}
