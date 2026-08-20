export default function Loading() {
  return (
    <main className="page" aria-busy="true" aria-live="polite">
      <section className="page-header">
        <div className="loading-heading">
          <span className="skeleton skeleton-eyebrow" />
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-subtitle" />
        </div>
      </section>
      <section className="grid grid-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <article className="card loading-card" key={index}>
            <span className="skeleton skeleton-label" />
            <span className="skeleton skeleton-value" />
            <span className="skeleton skeleton-note" />
          </article>
        ))}
      </section>
      <section className="grid grid-2 section-gap">
        <article className="card loading-panel"><span className="skeleton skeleton-panel" /></article>
        <article className="card loading-panel"><span className="skeleton skeleton-panel" /></article>
      </section>
      <p className="loading-copy">Actualizando la vista con tus datos financieros…</p>
    </main>
  );
}
