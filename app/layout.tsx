import type { Metadata } from "next";
import { APP_VERSION } from "../src/core/build-info";
import "./globals.css";
import "./touch-targets.css";

export const metadata: Metadata = {
  title: `Financial App ${APP_VERSION}`,
  description: `Financial App ${APP_VERSION} · finanzas personales seguras, acumulativas y verificadas`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
