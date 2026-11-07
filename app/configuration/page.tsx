import ConfigurationClient from "./configuration-client";

export const metadata = {
  title: "Configuración · Financial App",
  description: "Gestión persistente de cuentas y categorías de Financial App.",
};

type ConfigurationSearchParams = { tab?: string | string[] };

export default async function ConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<ConfigurationSearchParams>;
}) {
  const params = await searchParams;
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialTab = requestedTab === "categories" ? "categories" : "accounts";
  return <ConfigurationClient initialTab={initialTab} />;
}
