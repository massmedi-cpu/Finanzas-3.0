export const APP_VERSION = "0.0.1" as const;
export const TARGET_VERSION = "10.0.0" as const;
export const CURRENT_PHASE = 4 as const;
export const CURRENT_PHASE_NAME = "Movimientos" as const;
export const CURRENT_PHASE_BLOCK = 13 as const;
export const CURRENT_PHASE_BLOCK_NAME = "Duplicados y transferencias" as const;

export function getBuildInfo() {
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
