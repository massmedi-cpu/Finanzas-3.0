"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  MOBILE_FAVORITE_OPTIONS,
  readMobileFavorite,
  type MobileFavoriteHref,
  writeMobileFavorite,
} from "../src/application/local-preferences";
import { ProductIcon } from "../src/design/product-icons";
import { isNavigationActive, navigationItems } from "./navigation-items";
import { PwaInstallButton } from "./pwa-install-button";
import styles from "./app-shell.module.css";

const FIXED_MOBILE_HREFS = new Set(["/", "/transactions", "/analysis"]);

export default function MobileNavigation() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [favoriteHref, setFavoriteHref] = useState<MobileFavoriteHref>("/review");

  useEffect(() => {
    try {
      setFavoriteHref(readMobileFavorite(window.localStorage));
    } catch {
      setFavoriteHref("/review");
    }
  }, []);

  useEffect(() => setMoreOpen(false), [pathname]);

  const primary = useMemo(() => navigationItems.filter((item) => (
    FIXED_MOBILE_HREFS.has(item.href) || item.href === favoriteHref
  )), [favoriteHref]);
  const primaryHrefs = useMemo(() => new Set(primary.map((item) => item.href)), [primary]);
  const secondary = useMemo(() => navigationItems.filter((item) => !primaryHrefs.has(item.href)), [primaryHrefs]);
  const moreActive = secondary.some((item) => isNavigationActive(pathname, item.href));

  function updateFavorite(value: string) {
    if (!(MOBILE_FAVORITE_OPTIONS as readonly string[]).includes(value)) return;
    const href = value as MobileFavoriteHref;
    setFavoriteHref(href);
    try {
      writeMobileFavorite(window.localStorage, href);
    } catch {
      // La preferencia visual sigue funcionando durante esta sesión aunque el navegador bloquee storage.
    }
  }

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
                <Link prefetch={false}
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
            <div className={styles.mobilePreference}>
              <label htmlFor="mobile-favorite-section">Acceso favorito</label>
              <select
                id="mobile-favorite-section"
                value={favoriteHref}
                onChange={(event) => updateFavorite(event.target.value)}
              >
                {MOBILE_FAVORITE_OPTIONS.map((href) => {
                  const item = navigationItems.find((candidate) => candidate.href === href);
                  return item ? <option key={href} value={href}>{item.label}</option> : null;
                })}
              </select>
              <small>Solo se guarda en este dispositivo. No contiene datos financieros.</small>
            </div>
            <PwaInstallButton className={styles.mobileMoreInstall} />
          </nav>
        </div>
      ) : null}

      <nav className={styles.mobileDock} aria-label="Navegación móvil">
        {primary.map((item) => {
          const active = isNavigationActive(pathname, item.href);
          return (
            <Link prefetch={false}
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
