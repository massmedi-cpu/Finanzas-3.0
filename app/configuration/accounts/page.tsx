import ConfigurationClient from "../configuration-client";

export const metadata = {
  title: "Configurar cuentas · Financial App",
  description: "Gestión de cuentas financieras desde una única configuración persistente.",
};

export default function ConfigurationAccountsPage() {
  return <ConfigurationClient initialTab="accounts" />;
}
