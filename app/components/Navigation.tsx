'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  ['/', 'Inicio'],
  ['/movimientos', 'Movimientos'],
  ['/cuentas', 'Cuentas'],
  ['/presupuestos', 'Presupuestos'],
  ['/prevision', 'Previsión'],
] as const;

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Navegación principal">
      {links.map(([href, label]) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={`nav-link${active ? ' nav-link-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
