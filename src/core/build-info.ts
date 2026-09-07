// F13 starts from the exact F12 merge after the dashboard passed local and protected Preview gates. The final release checkpoint requires the same exact SHA to pass real production backup/restore evidence, browser regression and protected Vercel Preview before publishing 10.0.0.
export const APP_VERSION = "0.0.1" as const;
export const TARGET_VERSION = "10.0.0" as const;
export const CURRENT_PHASE = 13 as const;
export const CURRENT_PHASE_NAME = "Consolidación, respaldo, restauración y producción 10.0.0" as const;
export const CURRENT_PHASE_BLOCK = 1 as const;
export const CURRENT_PHASE_BLOCK_NAME = "Integración, regresión, limpieza, respaldo, restauración y publicación" as const;

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
