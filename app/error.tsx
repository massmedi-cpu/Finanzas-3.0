"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import { APP_VERSION } from "@/lib/app-version";

export default function Error({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
  useEffect(()=>{console.error("Financial App route error",error)},[error]);
  return <main className="system-state-shell">
    <section className="system-state-card" role="alert" aria-live="assertive">
      <div className="system-state-brand"><Image src="/brand/isotipo.png" width={38} height={38} alt="" priority/><div><strong>Financial App</strong><span>{APP_VERSION}</span></div></div>
      <h1>No se ha podido abrir esta vista</h1>
      <p>La aplicación sigue disponible y no se ha realizado ningún cambio en tus datos. Puedes volver a intentarlo o regresar a Inicio.</p>
      {error.digest&&<code className="system-error-code">Referencia {error.digest}</code>}
      <div className="system-state-actions"><button className="primary" type="button" onClick={reset}>Volver a intentar</button><Link className="secondary" href="/">Ir a Inicio</Link></div>
    </section>
  </main>;
}
