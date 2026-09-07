import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financial App 10.0.0",
  description: "Financial App 10.0.0 · finanzas personales seguras, acumulativas y verificadas",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
