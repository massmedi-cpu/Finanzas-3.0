import type { Metadata, Viewport } from "next";
import { APP_VERSION } from "../src/core/build-info";
import { ActionFeedbackProvider } from "./action-feedback";
import { CategoryIdentityProvider } from "./category-identity";
import { OperationalTelemetryReporter } from "./operational-telemetry";
import { PwaRuntimeProvider } from "./pwa-runtime";
import { VisualPreferencesProvider } from "./visual-preferences";
import "./globals.css";
import "./semantic-tokens.css";
import "./touch-targets.css";
import "./premium-states.css";
import "./visual-density.css";
import "./visual-preferences.css";
import "./category-controls.css";
import "./premium-theme.css";
import "./premium-hardening.css";
import "./accessibility-forced-colors.css";
import "./accessibility-live-regions.css";
import "./action-feedback.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Financial App ${APP_VERSION}`,
  applicationName: "Financial App",
  description: `Financial App ${APP_VERSION} · finanzas personales seguras, acumulativas y verificadas`,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/pwa-icon-192.svg",
    apple: "/pwa-icon-192.svg",
  },
  appleWebApp: {
    capable: true,
    title: "Financial App",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#030711",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" data-density="comfortable" data-reduce-motion="false">
      <body>
        <VisualPreferencesProvider>
          <ActionFeedbackProvider>
            <PwaRuntimeProvider>
              <CategoryIdentityProvider>{children}</CategoryIdentityProvider>
            </PwaRuntimeProvider>
          </ActionFeedbackProvider>
        </VisualPreferencesProvider>
        <OperationalTelemetryReporter enabled={process.env.VERCEL_ENV === "production"} />
      </body>
    </html>
  );
}
