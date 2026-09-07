// F11 protected Preview checkpoint from the exact validated F10 Production baseline. OCR stays isolated, read-only and human-reviewed; the live gate reads the synthetic Drive fixture without financial writes.
export const APP_VERSION = "0.0.1" as const;
export const TARGET_VERSION = "10.0.0" as const;
export const CURRENT_PHASE = 11 as const;
export const CURRENT_PHASE_NAME = "OCR" as const;
export const CURRENT_PHASE_BLOCK = 1 as const;
export const CURRENT_PHASE_BLOCK_NAME = "Extracción robusta y maquetación fiel" as const;

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
