import type { ReactNode } from "react";
import AppShell from "../app-shell";
import ConfigurationAreaNav from "./configuration-area-nav";

export default function ConfigurationLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <ConfigurationAreaNav />
      {children}
    </AppShell>
  );
}
