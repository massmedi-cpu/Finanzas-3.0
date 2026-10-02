import SourceOverviewClient from "./source-overview-client";

export const metadata = {
  title: "Fuente bancaria · Configuración · Financial App",
  description: "Conexión de solo lectura y sincronización controlada de la fuente bancaria oficial.",
};

export const dynamic = "force-dynamic";

export default function SourcePage() {
  return <SourceOverviewClient />;
}
