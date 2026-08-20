import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './extras.css';
import './planning.css';
import './recurring.css';
import './budget.css';
import './review.css';
import './reports.css';
import './splits.css';
import './plan.css';
import AppHeader from './components/AppHeader';

export const metadata: Metadata = {
  title: 'Finanzas 3.0',
  description: 'Centro privado de control y planificación financiera personal',
  applicationName: 'Finanzas 3.0',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
  referrer: 'no-referrer',
  robots: { index: false, follow: false, nocache: true },
  appleWebApp: { capable: true, title: 'Finanzas 3.0', statusBarStyle: 'default' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="shell">
          <AppHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
