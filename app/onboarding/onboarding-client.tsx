"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatInteger } from "../../src/core/formatters";
import styles from "./onboarding.module.css";

type GoogleStatus = {
  configured?: boolean;
  connection?: { connected?: boolean } | null;
};

type SyncStatus = {
  run?: {
    status?: string;
    rowsFailed?: number;
    warningsCount?: number;
    errorCode?: string | null;
  } | null;
  cursors?: unknown[];
};

type Configuration = {
  accounts?: Array<{ lifecycle?: string }>;
};

type FinancialSnapshot = {
  contractVersion?: number;
  principles?: { bankSource?: string };
};

type OnboardingState = {
  sourceAvailable: boolean;
  sourceConnected: boolean;
  sourceReady: boolean;
  accountsAvailable: boolean;
  activeAccounts: number;
  financialAvailable: boolean;
  financialReady: boolean;
};

type StepStatus = "Comprobando…" | "Completado" | "Siguiente" | "Pendiente" | "Bloqueado" | "No disponible";

type Step = {
  number: number;
  name: string;
  outcome: string;
  description: string;
  status: StepStatus;
  href: string;
  action: string;
  blocked: boolean;
};

const INITIAL_STATE: OnboardingState = {
  sourceAvailable: false,
  sourceConnected: false,
  sourceReady: false,
  accountsAvailable: false,
  activeAccounts: 0,
  financialAvailable: false,
  financialReady: false,
};

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("onboarding_source_unavailable");
  return response.json() as Promise<T>;
}

function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function statusClass(status: StepStatus) {
  if (status === "Completado") return styles.ready;
  if (status === "Siguiente" || status === "Pendiente") return styles.pending;
  if (status === "No disponible") return styles.unavailable;
  if (status === "Bloqueado") return styles.blocked;
  return styles.checking;
}

export default function OnboardingClient() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<OnboardingState>(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      const [sourceResult, syncResult, configurationResult] = await Promise.allSettled([
        readJson<GoogleStatus>("/api/source/google/status", controller.signal),
        readJson<SyncStatus>("/api/source/google/sync", controller.signal),
        readJson<Configuration>("/api/configuration", controller.signal),
      ] as const);

      if (controller.signal.aborted) return;

      const source = fulfilled(sourceResult);
      const sync = fulfilled(syncResult);
      const configuration = fulfilled(configurationResult);
      const sourceConnected = source?.configured === true && source.connection?.connected === true;
      const sourceAvailable = source !== null && sync !== null;
      const sourceReady = Boolean(
        sourceAvailable &&
        sourceConnected &&
        sync?.run?.status === "success" &&
        (sync.run.rowsFailed ?? 0) === 0 &&
        !sync.run.errorCode &&
        (sync.cursors?.length ?? 0) > 0,
      );
      const accountsAvailable = configuration !== null;
      const activeAccounts = configuration?.accounts?.filter((account) => account.lifecycle === "active").length ?? 0;

      let financialAvailable = false;
      let financialReady = false;
      if (sourceReady && accountsAvailable && activeAccounts > 0) {
        try {
          const financial = await readJson<FinancialSnapshot>("/api/financial?mode=snapshot", controller.signal);
          if (controller.signal.aborted) return;
          financialAvailable = true;
          financialReady = financial.contractVersion === 1 && financial.principles?.bankSource === "read_only";
        } catch {
          if (controller.signal.aborted) return;
        }
      }

      setState({
        sourceAvailable,
        sourceConnected,
        sourceReady,
        accountsAvailable,
        activeAccounts,
        financialAvailable,
        financialReady,
      });
      setLoading(false);
    })().catch(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    return () => controller.abort();
  }, []);

  const accountsReady = state.sourceReady && state.accountsAvailable && state.activeAccounts > 0;
  const summaryReady = accountsReady && state.financialReady;

  const steps = useMemo<Step[]>(() => {
    if (loading) {
      return [
        { number: 1, name: "Conecta tus movimientos", outcome: "Tus datos disponibles", description: "Comprobando si ya existe una fuente conectada.", status: "Comprobando…", href: "/configuration/source", action: "Abrir conexión", blocked: false },
        { number: 2, name: "Comprueba que están bien", outcome: "Datos verificados", description: "Comprobando la última actualización.", status: "Comprobando…", href: "/configuration/source", action: "Comprobar datos", blocked: true },
        { number: 3, name: "Confirma tus cuentas", outcome: "Cuentas preparadas", description: "Comprobando tus cuentas activas.", status: "Comprobando…", href: "/accounts", action: "Abrir cuentas", blocked: true },
        { number: 4, name: "Mira tu primer resumen", outcome: "Visión general lista", description: "Comprobando si el resumen financiero ya está disponible.", status: "Comprobando…", href: "/", action: "Ver resumen", blocked: true },
        { number: 5, name: "Revisa lo que necesita tu decisión", outcome: "Todo bajo control", description: "Comprobando si ya puedes revisar pendientes.", status: "Comprobando…", href: "/review", action: "Ver pendientes", blocked: true },
      ];
    }

    const step1Status: StepStatus = state.sourceConnected ? "Completado" : state.sourceAvailable ? "Siguiente" : "No disponible";
    const step2Status: StepStatus = state.sourceReady
      ? "Completado"
      : !state.sourceConnected
        ? "Bloqueado"
        : state.sourceAvailable
          ? "Siguiente"
          : "No disponible";
    const step3Status: StepStatus = accountsReady
      ? "Completado"
      : !state.sourceReady
        ? "Bloqueado"
        : state.accountsAvailable
          ? "Siguiente"
          : "No disponible";
    const step4Status: StepStatus = summaryReady
      ? "Completado"
      : !accountsReady
        ? "Bloqueado"
        : state.financialAvailable
          ? "Siguiente"
          : "No disponible";
    const step5Status: StepStatus = summaryReady ? "Siguiente" : "Bloqueado";

    return [
      {
        number: 1,
        name: "Conecta tus movimientos",
        outcome: "Tus datos disponibles",
        description: state.sourceConnected
          ? "Tus movimientos ya están conectados a Financial App."
          : state.sourceAvailable
            ? "Conecta la fuente bancaria para que Financial App pueda leer tus movimientos sin modificar el archivo original."
            : "No se ha podido comprobar ahora la conexión. Abre Fuente bancaria para volver a intentarlo.",
        status: step1Status,
        href: "/configuration/source",
        action: state.sourceConnected ? "Revisar conexión" : "Conectar movimientos",
        blocked: false,
      },
      {
        number: 2,
        name: "Comprueba que están bien",
        outcome: "Datos verificados",
        description: state.sourceReady
          ? "La última actualización terminó correctamente y no dejó filas fallidas."
          : !state.sourceConnected
            ? "Primero conecta tus movimientos. Después comprobarás que la lectura se ha completado correctamente."
            : "Haz una actualización segura para comprobar que los movimientos se pueden leer correctamente.",
        status: step2Status,
        href: "/configuration/source",
        action: "Comprobar y actualizar",
        blocked: !state.sourceConnected,
      },
      {
        number: 3,
        name: "Confirma tus cuentas",
        outcome: "Cuentas preparadas",
        description: accountsReady
          ? `${formatInteger(state.activeAccounts)} ${state.activeAccounts === 1 ? "cuenta activa está preparada" : "cuentas activas están preparadas"} para organizar tu dinero.`
          : !state.sourceReady
            ? "Cuando los movimientos estén verificados podrás revisar las cuentas detectadas."
            : state.accountsAvailable
              ? "Revisa Cuentas y deja activas las que quieras incluir en tu visión financiera."
              : "No se ha podido comprobar ahora la configuración de cuentas.",
        status: step3Status,
        href: "/accounts",
        action: accountsReady ? "Ver cuentas" : "Confirmar cuentas",
        blocked: !state.sourceReady,
      },
      {
        number: 4,
        name: "Mira tu primer resumen",
        outcome: "Visión general lista",
        description: summaryReady
          ? "Tu resumen financiero ya puede mostrar una visión conjunta de tus datos."
          : !accountsReady
            ? "El resumen se habilita cuando los datos y las cuentas están preparados."
            : "Abre Inicio para confirmar que ya puedes ver tu situación financiera de un vistazo.",
        status: step4Status,
        href: "/",
        action: "Ver mi resumen",
        blocked: !accountsReady,
      },
      {
        number: 5,
        name: "Revisa lo que necesita tu decisión",
        outcome: "Todo bajo control",
        description: summaryReady
          ? "Para revisar reúne en un solo lugar los avisos y decisiones que merecen tu atención."
          : "Cuando el primer resumen esté listo, Financial App te llevará a los elementos que requieren una decisión.",
        status: step5Status,
        href: "/review",
        action: "Ver qué necesita atención",
        blocked: !summaryReady,
      },
    ];
  }, [accountsReady, loading, state, summaryReady]);

  const completedCount = steps.filter((step) => step.status === "Completado").length;
  const activationComplete = !loading && summaryReady;
  const nextStep = steps.find((step) => step.status === "Siguiente") ?? steps.find((step) => !step.blocked && step.status !== "Completado") ?? null;

  return (
    <main className={styles.shell} aria-busy={loading} data-activation-complete={activationComplete ? "true" : "false"}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PON TUS FINANZAS EN MARCHA</p>
          <h1>De tus movimientos a una visión clara de tu dinero</h1>
          <p>
            Avanza por objetivos sencillos. Financial App comprueba el estado real de tus datos y te muestra solo el siguiente paso útil, sin pedirte que entiendas la parte técnica.
          </p>
        </div>
        <div className={styles.progress} aria-label="Progreso de puesta en marcha">
          <strong>{loading ? "…" : `${completedCount}/5`}</strong>
          <span>{loading ? "Comprobando tu estado" : activationComplete ? "Ya puedes usar tu resumen" : "Objetivos completados"}</span>
        </div>
      </header>

      <section className={styles.nextAction} aria-labelledby="next-action-heading">
        {activationComplete ? (
          <>
            <div>
              <p className={styles.nextEyebrow}>TU VISIÓN FINANCIERA YA ESTÁ LISTA</p>
              <h2 id="next-action-heading">Empieza por lo que importa hoy</h2>
              <p>Ya puedes consultar tu resumen y entrar directamente en los elementos que necesitan una decisión.</p>
            </div>
            <div className={styles.nextButtons}>
              <Link prefetch={false} className={styles.primaryAction} href="/">Ver mi resumen</Link>
              <Link prefetch={false} className={styles.secondaryAction} href="/review">Ver pendientes</Link>
            </div>
          </>
        ) : nextStep ? (
          <>
            <div>
              <p className={styles.nextEyebrow}>SIGUIENTE PASO · {nextStep.outcome.toUpperCase()}</p>
              <h2 id="next-action-heading">{nextStep.name}</h2>
              <p>{nextStep.description}</p>
            </div>
            <Link prefetch={false} className={styles.primaryAction} href={nextStep.href}>{nextStep.action}</Link>
          </>
        ) : (
          <div>
            <p className={styles.nextEyebrow}>COMPROBACIÓN TEMPORAL</p>
            <h2 id="next-action-heading">Revisa la conexión de tus datos</h2>
            <p>No hemos podido determinar automáticamente el siguiente paso. Tus datos existentes no se modifican.</p>
            <Link prefetch={false} className={styles.primaryAction} href="/configuration/source">Abrir Fuente bancaria</Link>
          </div>
        )}
      </section>

      <section className={styles.journey} aria-labelledby="journey-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>TU RECORRIDO</p>
            <h2 id="journey-heading">Cinco resultados, en orden</h2>
          </div>
          <p>No hay casillas que marcar: el progreso cambia cuando cambia el estado real de Financial App.</p>
        </div>

        <ol className={styles.steps}>
          {steps.map((step) => (
            <li key={step.number} className={styles.card} data-step-status={step.status}>
              <div className={styles.cardHeader}>
                <span className={styles.stepNumber} aria-hidden="true">{step.number}</span>
                <div className={styles.cardTitle}>
                  <p>{step.outcome}</p>
                  <h3>{step.name}</h3>
                </div>
                <span className={`${styles.status} ${statusClass(step.status)}`}>{step.status}</span>
              </div>
              <p className={styles.description}>{step.description}</p>
              {step.blocked ? (
                <span className={styles.blockedAction}>Se habilita al completar el objetivo anterior</span>
              ) : (
                <Link prefetch={false} className={styles.action} href={step.href}>{step.action}</Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      <details className={styles.technicalDetails}>
        <summary>Qué comprueba Financial App por detrás</summary>
        <div className={styles.technicalBody}>
          <p>
            Esta guía se limita a leer señales vivas: conexión de la fuente, última actualización válida, cuentas activas y disponibilidad del resumen. No guarda un progreso paralelo ni modifica la fuente bancaria.
          </p>
          <ul>
            <li>El archivo bancario original permanece en solo lectura.</li>
            <li>Una actualización con filas fallidas o error no se considera completada.</li>
            <li>El resumen solo se considera listo cuando el contrato financiero confirma la fuente en modo <code>read_only</code>.</li>
          </ul>
          <Link prefetch={false} className={styles.technicalLink} href="/configuration/source/diagnostics">Abrir diagnósticos de la fuente</Link>
        </div>
      </details>
    </main>
  );
}
