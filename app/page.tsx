export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <section className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Finanzas Alberto</h1>
          <p className="mt-2 text-slate-600">Centro de control financiero personal</p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl bg-white p-5 shadow">
            <h2 className="text-sm text-slate-500">Patrimonio</h2>
            <p className="mt-2 text-2xl font-semibold">0,00 €</p>
          </article>
          <article className="rounded-xl bg-white p-5 shadow">
            <h2 className="text-sm text-slate-500">Ingresos del mes</h2>
            <p className="mt-2 text-2xl font-semibold">0,00 €</p>
          </article>
          <article className="rounded-xl bg-white p-5 shadow">
            <h2 className="text-sm text-slate-500">Gastos del mes</h2>
            <p className="mt-2 text-2xl font-semibold">0,00 €</p>
          </article>
        </div>

        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-xl font-semibold">Próximamente</h2>
          <ul className="mt-3 list-disc pl-5 text-slate-600">
            <li>Movimientos bancarios inteligentes</li>
            <li>Presupuestos y objetivos</li>
            <li>Previsión financiera futura</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
