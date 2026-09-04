import ConfigurationClient from "./configuration-client";

export const metadata = {
  title: "Configuración · Financial App",
  description: "Gestión persistente de cuentas y categorías de Financial App.",
};

export default function ConfigurationPage() {
  return <ConfigurationClient />;
}
