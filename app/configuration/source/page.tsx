import SourceSimpleClient from "./source-simple-client";

export const metadata = {
  title: "Fuente bancaria · Configuración · Financial App",
  description: "Conexión de solo lectura y sincronización controlada de la fuente bancaria oficial.",
};

export default function SourceConfigurationPage() {
  return <SourceSimpleClient />;
}
