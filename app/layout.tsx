import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./auth.css";
import "./movements.css";
import "./movements-advanced.css";
import "./accounts.css";
import "./cash-flow.css";
import "./budget.css";
import "./forecast.css";
import "./forecast-scenario.css";
import "./net-worth.css";
import "./analysis.css";
import "./archive.css";
import "./settings.css";
import "./home.css";

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
const themeBootstrap = `try{const t=localStorage.getItem('financial-app-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeBootstrap}} /></head><body>{children}</body></html>;
}
