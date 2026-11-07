/**
 * REC-REL-455: independent gateway cutover. The release preview and the newly
 * promoted production deployment use the already deployed v3 Edge function.
 * The stable production gateway remains untouched for 10.0.103 rollback.
 * Unrelated previews retain the legacy gateway and preview-write denial.
 *
 * Only server-owned Vercel deployment metadata chooses the endpoint; no
 * query parameter, request header or browser-controlled setting is involved.
 */
export function resolveGatewayTarget(
  productionGatewayUrl: string,
  candidateGatewayUrl: string,
  env: Readonly<{ VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string }>,
): string {
  const isReleasePreview = env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "chat/integrated-b-e-c-visual-20261010";
  return env.VERCEL_ENV === "production" || isReleasePreview
    ? candidateGatewayUrl
    : productionGatewayUrl;
}
