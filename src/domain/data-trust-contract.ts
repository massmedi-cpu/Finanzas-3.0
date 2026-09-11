export type DataTrustState = "verified" | "operator_only" | "not_available";
export type DataTrustSection = "protection" | "data_lifecycle" | "commercial_readiness";

export interface DataTrustCapability {
  readonly id: string;
  readonly section: DataTrustSection;
  readonly title: string;
  readonly state: DataTrustState;
  readonly summary: string;
  readonly evidence: readonly string[];
}

export const DATA_TRUST_CAPABILITIES = [
  {
    id: "bank-source-readonly",
    section: "protection",
    title: "Fuente bancaria de solo lectura",
    state: "verified",
    summary:
      "La conexión oficial lee los datos necesarios y no dispone de permisos para escribir en la hoja bancaria de origen.",
    evidence: [
      "src/infrastructure/google/official-bank-source-reader.ts",
      "tests/e2e/source-profile-contract.spec.ts",
    ],
  },
  {
    id: "workspace-isolation",
    section: "protection",
    title: "Aislamiento por espacio de trabajo",
    state: "verified",
    summary:
      "La persistencia incorpora ownership por workspace y pruebas negativas para impedir acceso cruzado entre espacios de trabajo.",
    evidence: [
      "supabase/migrations/20260909193000_pre001_workspace_isolation.sql",
      "scripts/pre001-cross-tenant-smoke.sql",
    ],
  },
  {
    id: "preview-production-isolation",
    section: "protection",
    title: "Preview aislado de Production",
    state: "verified",
    summary:
      "Los entornos de prueba no pueden usar el flujo normal de mutación para escribir sobre la persistencia de Production.",
    evidence: [
      "tests/e2e/preview-production-isolation.spec.ts",
      "tests/e2e/preview-production-isolation-live.spec.ts",
    ],
  },
  {
    id: "operator-backup",
    section: "data_lifecycle",
    title: "Copia técnica y restauración",
    state: "operator_only",
    summary:
      "Existe un procedimiento técnico verificable de copia y restauración. No es una exportación de datos para el usuario.",
    evidence: [
      "scripts/create-financial-backup.mjs",
      "scripts/validate-financial-backup.mjs",
      "tests/e2e/backup-restore.spec.ts",
    ],
  },
  {
    id: "user-data-export",
    section: "data_lifecycle",
    title: "Exportar mis datos",
    state: "verified",
    summary:
      "Puedes descargar una exportación JSON estructurada de los datos de negocio del workspace. No incluye credenciales, secretos de plataforma ni binarios de documentos.",
    evidence: [
      "supabase/migrations/20260909213000_pre020_workspace_structured_export.sql",
      "app/api/data/export/route.ts",
      "tests/e2e/data-export-delivery-contract.spec.ts",
    ],
  },
  {
    id: "workspace-deletion",
    section: "data_lifecycle",
    title: "Borrado completo de datos",
    state: "not_available",
    summary:
      "El autoservicio, el orquestador Storage/Vault y la entrega de recibo ya están implementados en modo fail-closed. El borrado permanece bloqueado hasta que exista una política de retención aprobada y una activación comercial explícita.",
    evidence: [
      "app/api/data/deletion/route.ts",
      "app/configuration/data/workspace-deletion-panel.tsx",
      "src/domain/workspace-deletion-protocol.ts",
      "supabase/functions/financial-app-db-gateway/workspace-deletion-intent.ts",
      "tests/e2e/data-deletion-self-service-contract.spec.ts",
    ],
  },
  {
    id: "commercial-retention",
    section: "data_lifecycle",
    title: "Política de retención",
    state: "not_available",
    summary:
      "No hay una política comercial de retención definida. La retención de artefactos técnicos no se presenta como política de datos del usuario.",
    evidence: [],
  },
  {
    id: "privacy-and-terms",
    section: "commercial_readiness",
    title: "Privacidad y condiciones",
    state: "not_available",
    summary:
      "La aplicación aún no publica una política de privacidad ni condiciones comerciales definitivas.",
    evidence: [],
  },
  {
    id: "support-and-service-status",
    section: "commercial_readiness",
    title: "Soporte y estado del servicio",
    state: "not_available",
    summary:
      "Todavía no existe un canal comercial de soporte ni una página pública de estado e incidentes.",
    evidence: [],
  },
] as const satisfies readonly DataTrustCapability[];

export const DATA_TRUST_REVIEW = {
  contractVersion: 2,
  reviewedOn: "2026-09-11",
  scope: "Financial App · preparación comercial",
} as const;
