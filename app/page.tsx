import FinancialSummary from './components/FinancialSummary';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <section className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Finanzas Alberto</h1>
          <p className="mt-2 text-slate-600">Centro de control financiero personal</p>
        </header>

        <FinancialSummary />

        <nav className="grid gap-4 md:grid-cols-4">
          <button className="rounded-xl bg-white p-5 text-left shadow">Movimientos</button>
          <button className="rounded-xl bg-white p-5 text-left shadow">Cuentas</button>
          <button className="rounded-xl bg-white p-5 text-left shadow">Presupuestos</button>
          <button className="rounded-xl bg-white p-5 text-left shadow">Previsiones</button>
        </nav>

        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-xl font-semibold">Estado financiero</h2>
          <p className="mt-2 text-slate-600">Base preparada para conectar datos reales de cuentas y movimientos.</p>
        </section>
      </section>
    </main>
  );
}
