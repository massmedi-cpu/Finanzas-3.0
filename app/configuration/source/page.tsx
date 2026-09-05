import SourceClient from "./source-client";

export const metadata = {
  title: "Fuente bancaria · Configuración · Financial App",
  description: "Conexión de solo lectura y sincronización controlada de la fuente bancaria oficial.",
};

export default function SourceConfigurationPage() {
  return <SourceClient />;
}
