import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./auth.css";
import "./movements.css";
import "./accounts.css";
import "./cash-flow.css";
import "./budget.css";

export const metadata: Metadata = {
  title: { default: "Financial App", template: "%s · Financial App" },
  applicationName: "Financial App",
  description: "Control, análisis, presupuesto y planificación financiera personal",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Financial App", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0b72ff", colorScheme: "light dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
