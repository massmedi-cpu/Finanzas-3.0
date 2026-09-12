import type { ReactNode } from "react";
import AppShell from "../app-shell";
import ConfigurationAreaNav from "./configuration-area-nav";
import styles from "./configuration-polish.module.css";

export default function ConfigurationLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <ConfigurationAreaNav />
      <div className={styles.scope}>{children}</div>
    </AppShell>
  );
}
