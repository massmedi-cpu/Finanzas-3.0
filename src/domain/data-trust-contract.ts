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
    title: "Aislamiento interno de datos",
    state: "verified",
    summary:
      "Financial App mantiene una frontera técnica interna para aislar la persistencia y aplicar controles de acceso. Es una medida de seguridad, no una función multiusuario visible.",
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
    id: "technical-privacy",
    section: "protection",
    title: "Privacidad técnica",
    state: "verified",
    summary:
      "La sesión usa cookies estrictamente necesarias con HttpOnly y SameSite=Lax; en Production también se marcan Secure. La conexión de Google solicita identidad básica y únicamente permisos de lectura para Sheets y metadatos de Drive.",
    evidence: [
      "src/infrastructure/auth/access-control.ts",
      "src/infrastructure/auth/supabase-auth.ts",
      "src/infrastructure/google/google-oauth.ts",
      "src/infrastructure/google/official-bank-source-reader.ts",
      "tests/e2e/technical-privacy-contract.spec.ts",
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
      "Puedes descargar una exportación JSON estructurada de los datos gestionados por Financial App. No incluye credenciales, secretos de plataforma ni binarios de documentos.",
    evidence: [
      "supabase/migrations/20260909213000_pre020_workspace_structured_export.sql",
      "app/api/data/export/route.ts",
      "tests/e2e/data-export-delivery-contract.spec.ts",
    ],
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
  contractVersion: 4,
  reviewedOn: "2026-09-11",
  scope: "Financial App · producto monousuario",
} as const;
