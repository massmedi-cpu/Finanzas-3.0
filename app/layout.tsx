import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/version";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Control, análisis, presupuesto y planificación financiera personal.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
