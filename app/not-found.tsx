import Link from "next/link";
import Image from "next/image";
import { APP_VERSION } from "@/lib/app-version";

export default function NotFound(){
  return <main className="system-state-shell">
    <section className="system-state-card">
      <div className="system-state-brand"><Image src="/brand/isotipo.png" width={38} height={38} alt="" priority/><div><strong>Financial App</strong><span>{APP_VERSION}</span></div></div>
      <p className="eyebrow">404 · PÁGINA NO ENCONTRADA</p>
      <h1>Esta dirección no existe</h1>
      <p>Puede que el enlace sea antiguo o que la sección haya cambiado. Tus datos financieros no se han visto afectados.</p>
      <div className="system-state-actions"><Link className="primary" href="/">Volver a Inicio</Link><Link className="secondary" href="/movimientos">Abrir Movimientos</Link></div>
    </section>
  </main>;
}
