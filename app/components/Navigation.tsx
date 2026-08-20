import Link from 'next/link';

const links = [
  ['/', 'Inicio'],
  ['/movimientos', 'Movimientos'],
  ['/cuentas', 'Cuentas'],
  ['/presupuestos', 'Presupuestos'],
  ['/prevision', 'Previsión'],
];

export default function Navigation() {
  return (
    <nav className="nav" aria-label="Navegación principal">
      {links.map(([href, label]) => (
        <Link key={href} href={href} className="nav-link">
          {label}
        </Link>
      ))}
    </nav>
  );
}
