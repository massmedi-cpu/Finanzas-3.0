"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ProductIcon, type ProductIconName } from "../src/design/product-icons";
import styles from "./app-shell.module.css";

const navigation = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/onboarding", label: "Primeros pasos", icon: "onboarding" },
  { href: "/review", label: "Para revisar", icon: "review" },
  { href: "/transactions", label: "Movimientos", icon: "transactions" },
  { href: "/analysis", label: "Análisis", icon: "analysis" },
  { href: "/accounts", label: "Cuentas", icon: "accounts" },
  { href: "/budgets", label: "Presupuestos", icon: "budgets" },
  { href: "/recurrences", label: "Recurrentes", icon: "recurrences" },
  { href: "/forecast", label: "Previsión", icon: "forecast" },
  { href: "/documents", label: "Documentos", icon: "documents" },
  { href: "/configuration", label: "Configuración", icon: "settings" },
] satisfies ReadonlyArray<{ href: string; label: string; icon: ProductIconName }>;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.root}>
      <a
        className={styles.skipLink}
        href="#main-content"
        onClick={() => document.getElementById("main-content")?.focus()}
      >
        Saltar al contenido principal
      </a>
      <div className={styles.navigationFrame}>
        <nav className={styles.navigation} aria-label="Navegación principal">
          {navigation.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.link}${active ? ` ${styles.active}` : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.linkIcon}><ProductIcon name={item.icon} /></span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div id="main-content" tabIndex={-1} className={styles.content}>{children}</div>
    </div>
  );
}
