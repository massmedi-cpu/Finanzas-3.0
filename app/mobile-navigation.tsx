"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ProductIcon } from "../src/design/product-icons";
import { isNavigationActive, mobilePrimaryHrefs, navigationItems } from "./navigation-items";
import { PwaInstallButton } from "./pwa-install-button";
import styles from "./app-shell.module.css";

export default function MobileNavigation() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = useMemo(() => navigationItems.filter((item) => mobilePrimaryHrefs.has(item.href)), []);
  const secondary = useMemo(() => navigationItems.filter((item) => !mobilePrimaryHrefs.has(item.href)), []);
  const moreActive = secondary.some((item) => isNavigationActive(pathname, item.href));

  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <div className={styles.mobileNavigation}>
      {moreOpen ? (
        <div className={styles.mobileMorePanel} id="mobile-more-navigation">
          <div className={styles.mobileMoreHeader}>
            <strong>Más secciones</strong>
            <button type="button" onClick={() => setMoreOpen(false)} aria-label="Cerrar más secciones">×</button>
          </div>
          <nav className={styles.mobileMoreGrid} aria-label="Más secciones">
            {secondary.map((item) => {
              const active = isNavigationActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.mobileMoreLink}${active ? ` ${styles.mobileActive}` : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={styles.mobileDockIcon}><ProductIcon name={item.icon} /></span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <PwaInstallButton className={styles.mobileMoreInstall} />
          </nav>
        </div>
      ) : null}

      <nav className={styles.mobileDock} aria-label="Navegación móvil">
        {primary.map((item) => {
          const active = isNavigationActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.mobileDockLink}${active ? ` ${styles.mobileActive}` : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className={styles.mobileDockIcon}><ProductIcon name={item.icon} /></span>
              <span>{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={`${styles.mobileDockLink} ${styles.mobileMoreButton}${moreActive ? ` ${styles.mobileActive}` : ""}`}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-navigation"
          onClick={() => setMoreOpen((value) => !value)}
        >
          <span className={styles.mobileMoreGlyph} aria-hidden="true">•••</span>
          <span>Más</span>
        </button>
      </nav>
    </div>
  );
}
