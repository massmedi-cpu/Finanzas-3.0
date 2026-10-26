"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import styles from "./configuration-area.module.css";

const ITEMS = [
  { href: "/configuration", label: "Cuentas y categorías", exact: true },
  { href: "/configuration/preferences", label: "Preferencias", exact: false },
  { href: "/configuration/merchants", label: "Comercios y alias", exact: false },
  { href: "/configuration/rules", label: "Reglas", exact: false },
  { href: "/configuration/source", label: "Fuente bancaria", exact: false },
  { href: "/configuration/appearance", label: "Apariencia", exact: false },
  { href: "/configuration/data", label: "Datos y privacidad", exact: false },
] as const;

export default function ConfigurationAreaNav() {
  const pathname = usePathname();
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const navigation = navigationRef.current;
    const selected = navigation?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!navigation || !selected || navigation.scrollWidth <= navigation.clientWidth + 1) return;

    // Only horizontal motion. scrollIntoView would also jump the document
    // vertically when the active tab changes in a long configuration page.
    const visible = navigation.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    navigation.scrollLeft += item.left - visible.left - (visible.width - item.width) / 2;
  }, [pathname]);

  return (
    <div className={styles.wrap}>
      <nav ref={navigationRef} className={styles.nav} aria-label="Áreas de configuración">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              prefetch={false}
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
