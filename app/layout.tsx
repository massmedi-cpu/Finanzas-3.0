import type { ReactNode } from 'react';
import './globals.css';
import Navigation from './components/Navigation';

export const metadata = {
  title: 'Finanzas 3.0',
  description: 'Centro de control financiero personal',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="topbar-inner">
              <div className="brand">Finanzas 3.0</div>
              <Navigation />
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
