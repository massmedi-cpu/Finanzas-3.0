import type { ReactNode } from 'react';
import './globals.css';
import './extras.css';
import './planning.css';
import './recurring.css';
import './budget.css';
import './review.css';
import './reports.css';
import AppHeader from './components/AppHeader';

export const metadata = {
  title: 'Finanzas 3.0',
  description: 'Centro de control financiero personal',
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
