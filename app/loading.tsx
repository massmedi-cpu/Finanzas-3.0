export default function Loading() {
  return (
    <main className="reset-screen" aria-busy="true" aria-live="polite">
      <section className="reset-card" aria-label="Cargando Financial App">
        <p className="eyebrow">Financial App</p>
        <h1>Cargando tus datos</h1>
        <p>Estamos preparando la información necesaria para esta pantalla.</p>
      </section>
    </main>
  );
}
