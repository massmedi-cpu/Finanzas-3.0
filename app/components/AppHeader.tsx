'use client';

import { usePathname } from 'next/navigation';
import Navigation from './Navigation';

export default function AppHeader() {
  const pathname = usePathname();
  if (pathname.startsWith('/login')) return null;

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">Finanzas 3.0</div>
        <Navigation />
      </div>
    </header>
  );
}
