"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type WheelEvent } from "react";
import { APP_VERSION } from "../src/core/build-info";
import { ProductIcon } from "../src/design/product-icons";
import GlobalSearch from "./global-search";
import MobileNavigation from "./mobile-navigation";
import { isNavigationActive, navigationItems } from "./navigation-items";
import { PwaInstallButton } from "./pwa-install-button";
import { usePwaRuntime } from "./pwa-runtime";
import SourceTrustStatus from "./source-trust-status";
import connectivityStyles from "./connectivity-status.module.css";
import styles from "./app-shell.module.css";

const HIGH_VALUE_PREFETCH_ROUTES = [
  "/transactions",
  "/analysis",
  "/cash-flow",
  "/accounts",
  "/net-worth",
  "/budgets",
  "/forecast",
  "/alerts",
] as const;

const AppShellBoundaryContext = createContext(false);

export default function AppShell({ children }: { children: ReactNode }) {
  const alreadyInsideSharedShell = useContext(AppShellBoundaryContext);

  if (alreadyInsideSharedShell) {
    return <>{children}</>;
  }

  return (
    <AppShellBoundaryContext.Provider value={true}>
      <AppShellFrame>{children}</AppShellFrame>
    </AppShellBoundaryContext.Provider>
  );
}

function AppShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { online } = usePwaRuntime();
  const navigationRef = useRef<HTMLElement>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateNavigationScrollState = useCallback(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    const maxScroll = Math.max(0, navigation.scrollWidth - navigation.clientWidth);
    setCanScrollLeft(navigation.scrollLeft > 3);
    setCanScrollRight(navigation.scrollLeft < maxScroll - 3);
  }, []);

  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;

    updateNavigationScrollState();
    navigation.addEventListener("scroll", updateNavigationScrollState, { passive: true });
    window.addEventListener("resize", updateNavigationScrollState, { passive: true });

    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateNavigationScrollState);
    observer?.observe(navigation);

    return () => {
      navigation.removeEventListener("scroll", updateNavigationScrollState);
      window.removeEventListener("resize", updateNavigationScrollState);
      observer?.disconnect();
    };
  }, [updateNavigationScrollState]);

  useEffect(() => {
    setPendingHref(null);
    const frame = window.requestAnimationFrame(() => {
      const active = navigationRef.current?.querySelector<HTMLElement>("[aria-current='page']");
      active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      updateNavigationScrollState();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, updateNavigationScrollState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      HIGH_VALUE_PREFETCH_ROUTES.forEach((href) => router.prefetch(href));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [router]);

  function scrollNavigation(direction: -1 | 1) {
    const navigation = navigationRef.current;
    if (!navigation) return;
    navigation.scrollBy({
      left: direction * Math.max(260, navigation.clientWidth * 0.7),
      behavior: "smooth",
    });
  }

  function handleNavigationWheel(event: WheelEvent<HTMLElement>) {
    const navigation = navigationRef.current;
    if (!navigation || navigation.scrollWidth <= navigation.clientWidth + 3) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;

    const maxScroll = navigation.scrollWidth - navigation.clientWidth;
    const atStart = navigation.scrollLeft <= 1;
    const atEnd = navigation.scrollLeft >= maxScroll - 1;
    if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;

    event.preventDefault();
    navigation.scrollLeft += delta;
  }

  const activePath = pendingHref ?? pathname;

  return (
    <div className={styles.root} data-app-shell="shared">
      <a
        className={styles.skipLink}
        href="#main-content"
        onClick={() => document.getElementById("main-content")?.focus()}
      >
        Saltar al contenido principal
      </a>
      <div className={`${styles.navigationFrame} premium-nav-frame`}>
        <div className={styles.navigationShell}>
          <Link
            prefetch={false}
            href="/"
            className="financial-brand"
            aria-label={`Financial App ${APP_VERSION}, ir a Inicio`}
            onMouseEnter={() => router.prefetch("/")}
            onFocus={() => router.prefetch("/")}
            onClick={() => pathname !== "/" && setPendingHref("/")}
          >
            <span className="financial-brand__mark" aria-hidden="true">FA</span>
            <span className="financial-brand__copy">
              <strong>Financial App</strong>
              <small>v{APP_VERSION}</small>
            </span>
          </Link>
          <GlobalSearch />
          <div className={styles.navigationCluster}>
            <button
              type="button"
              className={styles.navigationScrollButton}
              onClick={() => scrollNavigation(-1)}
              disabled={!canScrollLeft}
              aria-label="Ver secciones anteriores del menú"
            >
              <ProductIcon name="chevron-left" size="1.1em" />
            </button>
            <nav
              ref={navigationRef}
              className={`${styles.navigation} premium-primary-nav`}
              aria-label="Navegación principal"
              aria-busy={pendingHref ? true : undefined}
              onWheel={handleNavigationWheel}
            >
              {navigationItems.map((item) => {
                const active = isNavigationActive(activePath, item.href);
                const pending = pendingHref === item.href;
                return (
                  <Link
                    prefetch={false}
                    key={item.href}
                    href={item.href}
                    className={`${styles.link}${active ? ` ${styles.active}` : ""}${pending ? ` ${styles.pending}` : ""}`}
                    aria-current={active && !pendingHref ? "page" : undefined}
                    data-nav-href={item.href}
                    onMouseEnter={() => router.prefetch(item.href)}
                    onFocus={() => router.prefetch(item.href)}
                    onClick={() => {
                      if (!isNavigationActive(pathname, item.href)) setPendingHref(item.href);
                    }}
                  >
                    <span className={styles.linkIcon}><ProductIcon name={item.icon} /></span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <PwaInstallButton className={`${styles.link} ${styles.installButton}`} />
            </nav>
            <button
              type="button"
              className={styles.navigationScrollButton}
              onClick={() => scrollNavigation(1)}
              disabled={!canScrollRight}
              aria-label="Ver más secciones del menú"
            >
              <ProductIcon name="chevron-right" size="1.1em" />
            </button>
          </div>
        </div>
        {pendingHref && <span className={styles.navigationProgress} aria-hidden="true" />}
      </div>
      {!online && (
        <div className={connectivityStyles.offlineBanner} role="status" aria-live="polite" data-testid="offline-status">
          <strong>Sin conexión</strong>
          <span>Se muestra la última información segura disponible. Al volver la red se revalidará automáticamente.</span>
        </div>
      )}
      <SourceTrustStatus pathname={pathname} />
      <div id="main-content" tabIndex={-1} className={styles.content}>{children}</div>
      <MobileNavigation />
    </div>
  );
}
