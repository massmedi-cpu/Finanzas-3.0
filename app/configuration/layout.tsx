import type { ReactNode } from "react";
import ConfigurationAreaNav from "./configuration-area-nav";

export default function ConfigurationLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ConfigurationAreaNav />
      {children}
    </>
  );
}
