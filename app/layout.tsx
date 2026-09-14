import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { APP_VERSION } from "../src/core/build-info";
import { OperationalTelemetryReporter } from "./operational-telemetry";
import "./globals.css";
import "./touch-targets.css";
import "./premium-states.css";
import "./accessibility-forced-colors.css";
import "./accessibility-live-regions.css";

export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const CR006_BETA_BRANCH = "commercial-readiness/cr006-zero-cost-beta";

export const metadata: Metadata = {
  title: `Financial App ${APP_VERSION}`,
  description: `Financial App ${APP_VERSION} · finanzas personales seguras, acumulativas y verificadas`,
  applicationName: "Financial App",
};

export const viewport: Viewport = {
  themeColor: "#07101f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cr006BetaRuntimeAvailable =
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === CR006_BETA_BRANCH;

  return (
    <html lang="es-ES">
      <body className={inter.className}>
        {cr006BetaRuntimeAvailable ? (
          <>
            <Script src="/cr006-beta-runtime.js" strategy="beforeInteractive" />
            <Script src="/cr006-beta-compat.js" strategy="beforeInteractive" />
            <Script src="/cr006-beta-contract-shim.js" strategy="beforeInteractive" />
          </>
        ) : null}
        {children}
        <OperationalTelemetryReporter enabled={process.env.VERCEL_ENV === "production"} />
      </body>
    </html>
  );
}
