"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProductIcon, type ProductIconName } from "../../src/design/product-icons";
import styles from "./configuration-area.module.css";

const ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  exact: boolean;
  icon: ProductIconName;
}> = [
  { href: "/configuration", label: "Cuentas y categorías", exact: true, icon: "accounts" },
  { href: "/configuration/merchants", label: "Comercios y alias", exact: false, icon: "merchant" },
  { href: "/configuration/rules", label: "Reglas", exact: false, icon: "rules" },
  { href: "/configuration/source", label: "Fuente bancaria", exact: false, icon: "bank" },
  { href: "/configuration/data", label: "Datos y privacidad", exact: false, icon: "privacy" },
];

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
              <span className={styles.icon} aria-hidden="true">
                <ProductIcon name={item.icon} size={18} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
