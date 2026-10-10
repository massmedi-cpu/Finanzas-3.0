import ConfigurationClient from "../configuration-client";

export const metadata = {
  title: "Configurar categorías · Financial App",
  description: "Gestión de categorías financieras desde una única configuración persistente.",
};

export default function ConfigurationCategoriesPage() {
  return <ConfigurationClient initialTab="categories" />;
}
