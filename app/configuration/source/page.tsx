import SourceOverviewClient from "./source-overview-client";
import { isBankSourceWriteDisabled } from "../../../src/application/source-preview-update-policy";

export const metadata = {
  title: "Fuente bancaria · Configuración · Financial App",
  description: "Conexión de solo lectura y sincronización controlada de la fuente bancaria oficial.",
};

export const dynamic = "force-dynamic";

export default function SourcePage() {
  // A preview reads the real bank workspace but must never offer an action
  // that the preview OIDC gateway is intentionally forbidden to execute.
  return <SourceOverviewClient previewReadOnly={isBankSourceWriteDisabled(process.env.VERCEL_ENV)} />;
}
