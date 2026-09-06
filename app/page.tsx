import Link from "next/link";
import { getBuildInfo } from "../src/core/build-info";
import { runCompleteFoundationHealthChecks } from "../src/core/foundation-gate";

export default function Home() {
  const build = getBuildInfo();
  const health = runCompleteFoundationHealthChecks();

  if (health.status !== "ok") {
    const failedChecks = health.checks
      .filter((check) => !check.passed)
      .map((check) => check.name)
      .join(", ");

    throw new Error(`Fundamentos no válidos: ${failedChecks}`);
  }

  const shortCommit = build.commit === "local" ? "local" : build.commit.slice(0, 8);

  return (
    <main className="reset-screen">
      <section className="reset-card" aria-labelledby="bootstrap-title">
        <p className="eyebrow">FINANCIAL APP · RECONSTRUCCIÓN ACUMULATIVA</p>
        <h1 id="bootstrap-title">Versión {build.version}</h1>
        <p>
          Fase {build.phase} — {build.phaseName}. Fases 1–5 permanecen cerradas y validadas;
          Presupuestos se construye sobre la misma fuente de verdad financiera y la persistencia ya aprobadas.
        </p>

        <div className="foundation-flags" aria-label="Reglas activas del desarrollo">
          <span>es-ES · EUR</span>
          <span>Fuente bancaria · solo lectura</span>
          <span>OCR · Fase 11</span>
          <span>
            Fundamentos · {health.passed}/{health.total} OK
          </span>
        </div>

        <div className="foundation-flags" aria-label="Accesos de la fase actual">
          <Link className="foundation-cta" href="/budgets">
            Abrir Presupuestos
          </Link>
          <Link className="foundation-cta" href="/transactions">
            Abrir Movimientos
          </Link>
          <Link className="foundation-cta" href="/configuration">
            Abrir Configuración
          </Link>
        </div>

        <dl className="build-meta">
          <div>
            <dt>Objetivo</dt>
            <dd>{build.targetVersion}</dd>
          </div>
          <div>
            <dt>Entorno</dt>
            <dd>{build.environment}</dd>
          </div>
          <div>
            <dt>Rama</dt>
            <dd>{build.branch}</dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd>{shortCommit}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
