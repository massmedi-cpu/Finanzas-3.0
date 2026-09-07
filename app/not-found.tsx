import Link from "next/link";

export default function NotFound() {
  return (
    <main className="reset-screen">
      <section className="reset-card" aria-labelledby="not-found-title">
        <p className="eyebrow">Financial App</p>
        <h1 id="not-found-title">Esta página no existe</h1>
        <p>La dirección puede haber cambiado o no formar parte de Financial App.</p>
        <Link className="foundation-cta" href="/">Volver a Inicio</Link>
      </section>
    </main>
  );
}
