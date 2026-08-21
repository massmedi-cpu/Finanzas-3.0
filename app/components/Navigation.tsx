'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const links = [
  ['/', 'Inicio'],
  ['/plan', 'Plan'],
  ['/movimientos', 'Movimientos'],
  ['/revision', 'Revisión'],
  ['/cierre', 'Cierre'],
  ['/reglas', 'Reglas'],
  ['/cuentas', 'Cuentas'],
  ['/presupuestos', 'Presupuestos'],
  ['/recurrentes', 'Recurrentes'],
  ['/prevision', 'Previsión'],
  ['/objetivos', 'Objetivos'],
  ['/informes', 'Informes'],
] as const;

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <nav className="nav" aria-label="Navegación principal">
      {links.map(([href, label]) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className={`nav-link${active ? ' nav-link-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
      <button type="button" className="nav-link nav-button" onClick={logout}>Salir</button>
    </nav>
  );
}
