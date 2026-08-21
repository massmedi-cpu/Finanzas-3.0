export function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="pageStack">
      <header className="pageHeader"><div><p className="eyebrow">Financial App</p><h1>{title}</h1><p>{description}</p></div></header>
      <div className="emptyState"><strong>Núcleo 0.1.0 preparado</strong><p>Esta sección está conectada al sistema de rutas protegido y se implementará por fases sobre el mismo núcleo financiero.</p></div>
    </section>
  );
}
