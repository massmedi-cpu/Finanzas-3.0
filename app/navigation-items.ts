import type { ProductIconName } from "../src/design/product-icons";

export type NavigationItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: ProductIconName;
};

export const navigationItems = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/onboarding", label: "Primeros pasos", icon: "onboarding" },
  { href: "/review", label: "Para revisar", shortLabel: "Revisar", icon: "review" },
  { href: "/transactions", label: "Movimientos", shortLabel: "Movs.", icon: "transactions" },
  { href: "/analysis", label: "Análisis", icon: "analysis" },
  { href: "/accounts", label: "Cuentas", icon: "accounts" },
  { href: "/budgets", label: "Presupuestos", icon: "budgets" },
  { href: "/recurrences", label: "Recurrentes", icon: "recurrences" },
  { href: "/forecast", label: "Previsión", icon: "forecast" },
  { href: "/documents", label: "Documentos", icon: "documents" },
  { href: "/configuration", label: "Configuración", icon: "settings" },
] satisfies ReadonlyArray<NavigationItem>;

export const mobilePrimaryHrefs = new Set(["/", "/transactions", "/analysis", "/review"]);

export function isNavigationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
