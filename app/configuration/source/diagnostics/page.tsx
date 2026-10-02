import SourceClient from "../source-client";

export const metadata = {
  title: "Diagnóstico de fuente bancaria · Configuración · Financial App",
  description: "Trazabilidad técnica y diagnóstico de la fuente bancaria de solo lectura.",
};

export const dynamic = "force-dynamic";

export default function SourceDiagnosticsPage() {
  return <SourceClient />;
}
