"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./configuration-area.module.css";

const ITEMS = [
  { href: "/configuration", label: "Cuentas y categorías", exact: true },
  { href: "/configuration/source", label: "Fuente bancaria", exact: false },
] as const;

export default function ConfigurationAreaNav() {
  const pathname = usePathname();

  return (
    <div className={styles.wrap}>
      <nav className={styles.nav} aria-label="Áreas de configuración">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.link} ${active ? styles.active : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
