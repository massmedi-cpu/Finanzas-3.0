"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="reset-screen">
      <section className="reset-card" role="alert" aria-labelledby="global-error-title">
        <p className="eyebrow">Financial App</p>
        <h1 id="global-error-title">No se ha podido mostrar esta pantalla</h1>
        <p>Los datos existentes no se han modificado. Puedes volver a intentarlo o regresar a Inicio.</p>
        <div className="form-actions" style={{ justifyContent: "center" }}>
          <button className="primary-button" type="button" onClick={() => reset()}>Reintentar</button>
          <a className="secondary-button" href="/">Volver a Inicio</a>
        </div>
      </section>
    </main>
  );
}
