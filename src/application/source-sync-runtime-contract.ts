export const SOURCE_SYNC_RUNTIME_CONTRACT_VERSION = 2 as const;

export type SourceSyncRuntimeCapabilities = {
  contractVersion: number;
  sourceAccountLifecycle: boolean;
  canonicalProductSelection: boolean;
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
    capabilities.canonicalProductSelection !== true
  ) {
    throw new SourceSyncRuntimeCompatibilityError(
      "El runtime de sincronización no es compatible con el contrato de Fase 2 vigente.",
    );
  }
}
