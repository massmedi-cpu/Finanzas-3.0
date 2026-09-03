import { getBuildInfo } from "../src/core/build-info";
import { runFoundationHealthChecks } from "../src/core/foundation-health";

export default function Home() {
  const build = getBuildInfo();
  const health = runFoundationHealthChecks();
  const shortCommit = build.commit === "local" ? "local" : build.commit.slice(0, 8);

  return (
    <main className="reset-screen">
      <section className="reset-card" aria-labelledby="bootstrap-title">
        <p className="eyebrow">FINANCIAL APP · NUEVO DESARROLLO</p>
        <h1 id="bootstrap-title">Versión {build.version}</h1>
        <p>
          Fase {build.phase} — {build.phaseName}. Base limpia en construcción antes de habilitar
          módulos financieros dependientes.
        </p>

        <div className="foundation-flags" aria-label="Reglas activas del desarrollo">
          <span>es-ES · EUR</span>
          <span>Fuente bancaria · solo lectura</span>
          <span>OCR · Fase 11</span>
          <span>
            Fundamentos · {health.passed}/{health.total} {health.status === "ok" ? "OK" : "ERROR"}
          </span>
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
