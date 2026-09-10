import {
  DATA_TRUST_CAPABILITIES,
  DATA_TRUST_REVIEW,
  type DataTrustSection,
  type DataTrustState,
} from "../../../src/domain/data-trust-contract";
import styles from "./data-trust.module.css";

export const metadata = {
  title: "Datos y privacidad · Configuración · Financial App",
  description: "Estado verificable de protección, ciclo de datos y preparación comercial de Financial App.",
};

const SECTION_ORDER: readonly DataTrustSection[] = [
  "protection",
  "data_lifecycle",
  "commercial_readiness",
];

const SECTION_LABELS: Record<DataTrustSection, { title: string; description: string }> = {
  protection: {
    title: "Protecciones verificadas",
    description: "Controles que ya cuentan con evidencia técnica y pruebas de regresión.",
  },
  data_lifecycle: {
    title: "Ciclo de tus datos",
    description: "Qué puedes hacer hoy con tus datos y qué sigue siendo una capacidad técnica o pendiente.",
  },
  commercial_readiness: {
    title: "Preparación para un servicio comercial",
    description: "Elementos que deberán estar definidos antes de una eventual salida pública.",
  },
};

const STATE_LABELS: Record<DataTrustState, string> = {
  verified: "Verificado",
  operator_only: "Operación técnica",
  not_available: "No disponible todavía",
};

export default function DataTrustPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Transparencia de datos</p>
        <h1>Datos y privacidad</h1>
        <p className={styles.lead}>
          Aquí se distingue lo que Financial App puede demostrar hoy de lo que todavía no ofrece. Ninguna capacidad pendiente se presenta como disponible.
        </p>
        <div className={styles.notice} role="note">
          Esta pantalla describe capacidades actuales del producto. No sustituye una política de privacidad ni unas condiciones de uso comerciales.
        </div>
      </header>

      <div className={styles.reviewMeta} aria-label="Revisión del contrato de confianza">
        <span>Contrato v{DATA_TRUST_REVIEW.contractVersion}</span>
        <span>Revisado el {new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(`${DATA_TRUST_REVIEW.reviewedOn}T12:00:00+02:00`))}</span>
      </div>

      <div className={styles.sections}>
        {SECTION_ORDER.map((section) => {
          const copy = SECTION_LABELS[section];
          const items = DATA_TRUST_CAPABILITIES.filter((capability) => capability.section === section);

          return (
            <section className={styles.section} key={section} aria-labelledby={`trust-${section}`}>
              <div className={styles.sectionHeading}>
                <h2 id={`trust-${section}`}>{copy.title}</h2>
                <p>{copy.description}</p>
              </div>

              <div className={styles.grid}>
                {items.map((capability) => (
                  <article className={styles.card} key={capability.id} data-trust-state={capability.state}>
                    <div className={styles.cardHeader}>
                      <h3>{capability.title}</h3>
                      <span className={styles.badge} data-state={capability.state}>
                        {STATE_LABELS[capability.state]}
                      </span>
                    </div>
                    <p>{capability.summary}</p>
                    {capability.id === "user-data-export" ? (
                      <div className={styles.actionBlock}>
                        <a className={styles.action} href="/api/data/export">
                          Descargar mis datos
                        </a>
                        <small>
                          Se descarga un archivo JSON estructurado. Los documentos se incluyen como metadatos y relaciones; sus binarios no forman parte del archivo.
                        </small>
                      </div>
                    ) : null}
                    {capability.state === "verified" && capability.id !== "user-data-export" ? (
                      <small>Respaldado por {capability.evidence.length} controles o pruebas versionadas.</small>
                    ) : null}
                    {capability.state === "operator_only" ? (
                      <small>Disponible para operación técnica; no es una función de autoservicio.</small>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
