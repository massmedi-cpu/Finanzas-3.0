"use client";

import Link from "next/link";
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

function isSelected(pathname: string, item: typeof ITEMS[number]) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

function AreaLinks({ pathname }: { pathname: string }) {
  return ITEMS.map((item) => (
    <Link
      prefetch={false}
      key={item.href}
      href={item.href}
      className={`${styles.link} ${isSelected(pathname, item) ? styles.active : ""}`}
      aria-current={isSelected(pathname, item) ? "page" : undefined}
    >
      {item.label}
    </Link>
  ));
}

export default function ConfigurationAreaNav() {
  const pathname = usePathname();
  const current = ITEMS.find(item => isSelected(pathname, item)) ?? ITEMS[0];
  return (
    <div className={styles.wrap}>
      <nav className={styles.nav} aria-label="Áreas de configuración">
        <details className={styles.mobileDisclosure} key={pathname}>
          <summary>
            <span>Sección de configuración</span>
            <strong>{current.label}</strong>
            <span aria-hidden="true" className={styles.chevron}>⌄</span>
          </summary>
          <div className={styles.mobileLinks}><AreaLinks pathname={pathname} /></div>
        </details>
        <div className={styles.desktopLinks} data-desktop-areas>
          <AreaLinks pathname={pathname} />
        </div>
      </nav>
    </div>
  );
}
