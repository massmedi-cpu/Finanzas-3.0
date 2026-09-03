import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financial App 0.0.1",
  description: "Construcción desde cero de Financial App hacia la versión 10.0.0",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
