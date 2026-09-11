import type { Metadata } from "next";
import { APP_VERSION } from "../src/core/build-info";
import { OperationalTelemetryReporter } from "./operational-telemetry";
import "./globals.css";
import "./touch-targets.css";
import "./premium-states.css";
import "./accessibility-forced-colors.css";
import "./accessibility-live-regions.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Financial App ${APP_VERSION}`,
  description: `Financial App ${APP_VERSION} · finanzas personales seguras, acumulativas y verificadas`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <OperationalTelemetryReporter enabled={process.env.VERCEL_ENV === "production"} />
      </body>
    </html>
  );
}
