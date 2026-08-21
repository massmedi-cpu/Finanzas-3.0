import type { Metadata } from "next";
import "./globals.css";
import "./movements.css";

export const metadata: Metadata = {
  title: "Financial App",
  description: "Control, análisis, presupuesto y planificación financiera personal",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
