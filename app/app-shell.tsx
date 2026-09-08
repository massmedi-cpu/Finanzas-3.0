"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./app-shell.module.css";

const navigation = [
  { href: "/", label: "Inicio" },
  { href: "/transactions", label: "Movimientos" },
  { href: "/accounts", label: "Cuentas" },
  { href: "/budgets", label: "Presupuestos" },
  { href: "/recurrences", label: "Recurrentes" },
  { href: "/forecast", label: "Previsión" },
  { href: "/documents", label: "Documentos" },
  { href: "/configuration", label: "Configuración" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.root}>
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
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
