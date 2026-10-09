"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [favoriteHref, setFavoriteHref] = useState<MobileFavoriteHref>("/review");
  const panelRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      setFavoriteHref(readMobileFavorite(window.localStorage));
    } catch {
      setFavoriteHref("/review");
    }
  }, []);

  useEffect(() => setMoreOpen(false), [pathname]);

  // Cambiar de móvil a escritorio nunca debe dejar un panel abierto e invisible
  // ni mantener el foco sobre un control que ya no se muestra.
  useEffect(() => {
    const breakpoint = window.matchMedia("(max-width: 48rem)");
    const onViewportChange = () => {
      if (breakpoint.matches) return;
      const wasOpen = moreOpen;
      setMoreOpen(false);
      // Puede haberse perdido el foco al ocultarse el panel por CSS antes del evento.
      // Si estaba abierto, siempre entregamos el foco a la navegación de escritorio.
      if (wasOpen) {
        document.querySelector<HTMLElement>('nav[aria-label="Navegación principal"] [aria-current="page"]')?.focus();
      }
    };
    breakpoint.addEventListener("change", onViewportChange);
    return () => breakpoint.removeEventListener("change", onViewportChange);
  }, [moreOpen]);

  // El panel aparece antes del dock en el DOM: mover el foco permite recorrerlo
  // con Tab desde «Más», en vez de dejar el teclado fuera del contenido abierto.
  useEffect(() => {
    if (!moreOpen) return;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMoreOpen(false);
      moreButtonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (panelRef.current?.contains(event.target) || moreButtonRef.current?.contains(event.target)) return;
      setMoreOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [moreOpen]);

  const primary = useMemo(() => navigationItems.filter((item) => (
    FIXED_MOBILE_HREFS.has(item.href) || item.href === favoriteHref
  )), [favoriteHref]);
  const primaryHrefs = useMemo(() => new Set(primary.map((item) => item.href)), [primary]);
  const secondary = useMemo(() => navigationItems.filter((item) => !primaryHrefs.has(item.href)), [primaryHrefs]);
  const moreActive = secondary.some((item) => isNavigationActive(pathname, item.href));

  function closeMoreFromPanel() {
    setMoreOpen(false);
    moreButtonRef.current?.focus();
  }

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
      <div ref={panelRef} className={styles.mobileMorePanel} id="mobile-more-navigation" hidden={!moreOpen}>
        {moreOpen && <>
          <div className={styles.mobileMoreHeader}>
            <strong>Más secciones</strong>
            <button type="button" onClick={closeMoreFromPanel} aria-label="Cerrar más secciones">
              <ProductIcon name="close" size="1.15em" />
            </button>
          </div>
          <nav className={styles.mobileMoreGrid} aria-label="Más secciones">
            {secondary.map((item) => {
              const active = isNavigationActive(pathname, item.href);
              return (
                <Link
                  prefetch={false}
                  key={item.href}
                  href={item.href}
                  className={`${styles.mobileMoreLink}${active ? ` ${styles.mobileActive}` : ""}`}
                  aria-current={active ? "page" : undefined}
                  onMouseEnter={() => router.prefetch(item.href)}
                  onFocus={() => router.prefetch(item.href)}
                  onTouchStart={() => router.prefetch(item.href)}
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
        </>}
      </div>

      <nav className={styles.mobileDock} aria-label="Navegación móvil">
        {primary.map((item) => {
          const active = isNavigationActive(pathname, item.href);
          return (
            <Link
              prefetch={false}
              key={item.href}
              href={item.href}
              className={`${styles.mobileDockLink}${active ? ` ${styles.mobileActive}` : ""}`}
              aria-current={active ? "page" : undefined}
              onMouseEnter={() => router.prefetch(item.href)}
              onFocus={() => router.prefetch(item.href)}
              onTouchStart={() => router.prefetch(item.href)}
            >
              <span className={styles.mobileDockIcon}><ProductIcon name={item.icon} /></span>
              <span>{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}
        <button
          ref={moreButtonRef}
          type="button"
          className={`${styles.mobileDockLink} ${styles.mobileMoreButton}${moreActive ? ` ${styles.mobileActive}` : ""}`}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-navigation"
          onClick={() => setMoreOpen((value) => !value)}
        >
          <span className={styles.mobileMoreGlyph}><ProductIcon name="more" /></span>
          <span>Más</span>
        </button>
      </nav>
    </div>
  );
}
