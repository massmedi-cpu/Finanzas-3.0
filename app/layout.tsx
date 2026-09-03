import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financial App 10.0.0",
  description: "Nueva base limpia de Financial App",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
