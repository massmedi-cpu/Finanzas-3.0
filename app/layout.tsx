import type { Metadata, Viewport } from "next";
import { APP_VERSION } from "../src/core/build-info";
import { ActionFeedbackProvider } from "./action-feedback";
import AppShell from "./app-shell";
import { CategoryIdentityProvider } from "./category-identity";
import { OperationalTelemetryReporter } from "./operational-telemetry";
import { ProductPreferencesProvider } from "./product-preferences";
import { PwaRuntimeProvider } from "./pwa-runtime";
import { VisualPreferencesProvider } from "./visual-preferences";
import "./globals.css";
import "./semantic-tokens.css";
import "./touch-targets.css";
import "./premium-states.css";
import "./visual-density.css";
import "./visual-preferences.css";
import "./product-preferences.css";
import "./category-controls.css";
import "./premium-theme.css";
import "./premium-hardening.css";
import "./accessibility-forced-colors.css";
import "./accessibility-live-regions.css";
import "./action-feedback.css";
import "./theme-system.css";
import "./app-background.css";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf2f9" },
    { media: "(prefers-color-scheme: dark)", color: "#030711" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      data-density="comfortable"
      data-reduce-motion="false"
      data-theme-preference="system"
      data-theme="dark"
      data-privacy-on-blur="true"
      data-budget-focus="all"
      suppressHydrationWarning
    >
      <head>
        <script src="/theme-init.js" />
      </head>
      <body>
        <VisualPreferencesProvider>
          <ProductPreferencesProvider>
            <ActionFeedbackProvider>
              <PwaRuntimeProvider>
                <CategoryIdentityProvider>
                  <AppShell>{children}</AppShell>
                </CategoryIdentityProvider>
              </PwaRuntimeProvider>
            </ActionFeedbackProvider>
          </ProductPreferencesProvider>
        </VisualPreferencesProvider>
        <OperationalTelemetryReporter enabled={process.env.VERCEL_ENV === "production"} />
      </body>
    </html>
  );
}
