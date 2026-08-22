import Image from "next/image";
import { APP_VERSION } from "@/lib/app-version";

export default function Loading(){
  return <main className="system-state-shell" aria-busy="true">
    <section className="system-state-card" role="status" aria-live="polite" aria-atomic="true">
      <div className="system-state-brand"><Image src="/brand/isotipo.png" width={38} height={38} alt="" priority/><div><strong>Financial App</strong><span>{APP_VERSION} · cargando</span></div></div>
      <div className="system-loading-row"><span className="system-spinner" aria-hidden="true"/><div className="system-loading-copy"><strong>Actualizando tu información</strong><span>Estamos preparando la siguiente vista. Tus datos no se están modificando.</span></div></div>
    </section>
  </main>;
}
