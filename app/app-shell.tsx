"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { APP_VERSION } from "../src/core/build-info";
import { ProductIcon } from "../src/design/product-icons";
import GlobalSearch from "./global-search";
import MobileNavigation from "./mobile-navigation";
import { isNavigationActive, navigationItems } from "./navigation-items";
import { PwaInstallButton } from "./pwa-install-button";
import styles from "./app-shell.module.css";

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
      <div className={`${styles.navigationFrame} premium-nav-frame`}>
        <div className={styles.navigationShell}>
          <Link
            prefetch={false}
            href="/"
            className="financial-brand"
            aria-label={`Financial App ${APP_VERSION}, ir a Inicio`}
          >
            <span className="financial-brand__mark" aria-hidden="true">FA</span>
            <span className="financial-brand__copy">
              <strong>Financial App</strong>
              <small>v{APP_VERSION}</small>
            </span>
          </Link>
          <GlobalSearch />
          <nav className={`${styles.navigation} premium-primary-nav`} aria-label="Navegación principal">
            {navigationItems.map((item) => {
              const active = isNavigationActive(pathname, item.href);
              return (
                <Link prefetch={false}
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
            <PwaInstallButton className={`${styles.link} ${styles.installButton}`} />
          </nav>
        </div>
      </div>
      <div id="main-content" tabIndex={-1} className={styles.content}>{children}</div>
      <MobileNavigation />
    </div>
  );
}
