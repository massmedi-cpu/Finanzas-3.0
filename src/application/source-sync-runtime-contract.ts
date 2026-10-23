export const SOURCE_SYNC_RUNTIME_CONTRACT_VERSION = 3 as const;

export type SourceSyncRuntimeCapabilities = {
  contractVersion: number;
  sourceAccountLifecycle: boolean;
  canonicalProductSelection: boolean;
  /** Only a gateway with bounded, workspace-scoped full-row postflight may enable sync. */
  sourcePostflightRows: boolean;
};

export class SourceSyncRuntimeCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceSyncRuntimeCompatibilityError";
  }
}

export function assertSourceSyncRuntimeCapabilities(
  value: unknown,
): asserts value is SourceSyncRuntimeCapabilities {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SourceSyncRuntimeCompatibilityError(
      "El runtime de sincronización no ha declarado capacidades válidas.",
    );
  }

  const capabilities = value as Partial<SourceSyncRuntimeCapabilities>;
  if (
    capabilities.contractVersion !== SOURCE_SYNC_RUNTIME_CONTRACT_VERSION ||
    capabilities.sourceAccountLifecycle !== true ||
    capabilities.canonicalProductSelection !== true ||
    capabilities.sourcePostflightRows !== true
  ) {
    throw new SourceSyncRuntimeCompatibilityError(
      "El runtime de sincronización no es compatible con el contrato de Fase 2 vigente.",
    );
  }
}
