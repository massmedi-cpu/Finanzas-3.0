// F13 final Axioma closure: the application release is now 10.0.0 only after the complete reconstruction passed backup/restore, browser regression and protected Preview gates. Further corrections must evolve as 10.0.x without reopening the reset-base identity.
export const APP_VERSION = "10.0.0" as const;
export const TARGET_VERSION = "10.0.0" as const;
export const CURRENT_PHASE = 13 as const;
export const CURRENT_PHASE_NAME = "Consolidación, respaldo, restauración y producción 10.0.0" as const;
export const CURRENT_PHASE_BLOCK = 1 as const;
export const CURRENT_PHASE_BLOCK_NAME = "Integración, regresión, limpieza, respaldo, restauración y publicación" as const;

function assertReleaseIdentity() {
  if (APP_VERSION !== TARGET_VERSION) {
    throw new Error("release_version_mismatch");
  }
}

export function getBuildInfo() {
  assertReleaseIdentity();

  return {
    version: APP_VERSION,
    targetVersion: TARGET_VERSION,
    phase: CURRENT_PHASE,
    phaseName: CURRENT_PHASE_NAME,
    phaseBlock: CURRENT_PHASE_BLOCK,
    phaseBlockName: CURRENT_PHASE_BLOCK_NAME,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    environment: process.env.VERCEL_ENV ?? "local",
  } as const;
}
