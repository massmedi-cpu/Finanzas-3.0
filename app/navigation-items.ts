import type { ProductIconName } from "../src/design/product-icons";

export type NavigationItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: ProductIconName;
};

export const navigationItems = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/cash-flow", label: "Cash Flow", icon: "future" },
  { href: "/onboarding", label: "Primeros pasos", icon: "onboarding" },
  { href: "/review", label: "Para revisar", shortLabel: "Revisar", icon: "review" },
  { href: "/alerts", label: "Alertas", icon: "review" },
  { href: "/transactions", label: "Movimientos", shortLabel: "Movs.", icon: "transactions" },
  { href: "/analysis", label: "Análisis", icon: "analysis" },
  { href: "/compare", label: "Comparador", shortLabel: "Comparar", icon: "balance" },
  { href: "/accounts", label: "Cuentas", icon: "accounts" },
  { href: "/net-worth", label: "Patrimonio", icon: "balance" },
  { href: "/budgets", label: "Presupuestos", icon: "budgets" },
  { href: "/recurrences", label: "Recurrentes", icon: "recurrences" },
  { href: "/forecast", label: "Previsión", icon: "forecast" },
  { href: "/documents", label: "Documentos", icon: "documents" },
  { href: "/configuration", label: "Configuración", icon: "settings" },
] satisfies ReadonlyArray<NavigationItem>;

export function isNavigationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
