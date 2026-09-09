"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  sourceReady: boolean;
  accountsAvailable: boolean;
  activeAccounts: number;
  financialAvailable: boolean;
  financialReady: boolean;
};

type StepStatus = "Comprobando…" | "Completado" | "Listo" | "Pendiente" | "Bloqueado" | "No disponible";

type Step = {
  number: number;
  name: string;
  description: string;
  status: StepStatus;
  href: string;
  action: string;
  blocked: boolean;
};

const INITIAL_STATE: OnboardingState = {
  sourceAvailable: false,
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
  if (status === "Completado" || status === "Listo") return styles.ready;
  if (status === "Pendiente") return styles.pending;
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
      const sourceAvailable = source !== null && sync !== null;
      const sourceReady = Boolean(
        sourceAvailable &&
        source?.configured === true &&
        source.connection?.connected === true &&
        sync?.run?.status === "success" &&
        (sync.run.rowsFailed ?? 0) === 0 &&
        !sync.run.errorCode &&
        (sync.cursors?.length ?? 0) > 0
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

  const steps: Step[] = loading
    ? [
        { number: 1, name: "Fuente bancaria", description: "Conecta y valida la fuente bancaria de solo lectura.", status: "Comprobando…", href: "/configuration/source", action: "Abrir fuente bancaria", blocked: false },
        { number: 2, name: "Cuentas", description: "Comprueba que tus cuentas están disponibles para organizar el dinero.", status: "Comprobando…", href: "/accounts", action: "Abrir cuentas", blocked: true },
        { number: 3, name: "Primer resumen", description: "Confirma que Financial App puede mostrar el primer resumen desde el motor central.", status: "Comprobando…", href: "/", action: "Abrir resumen", blocked: true },
        { number: 4, name: "Pendientes", description: "Termina revisando las señales que requieren una decisión explícita.", status: "Comprobando…", href: "/review", action: "Ver pendientes", blocked: true },
      ]
    : [
        {
          number: 1,
          name: "Fuente bancaria",
          description: state.sourceReady
            ? "La fuente está conectada y existe una sincronización válida sin filas fallidas."
            : state.sourceAvailable
              ? "Conecta y valida la fuente bancaria antes de continuar. La fuente original seguirá siendo de solo lectura."
              : "No se ha podido comprobar ahora el estado de la fuente bancaria.",
          status: state.sourceReady ? "Completado" : state.sourceAvailable ? "Pendiente" : "No disponible",
          href: "/configuration/source",
          action: state.sourceReady ? "Revisar fuente" : "Conectar y validar",
          blocked: false,
        },
        {
          number: 2,
          name: "Cuentas",
          description: accountsReady
            ? `${state.activeAccounts.toLocaleString("es-ES")} ${state.activeAccounts === 1 ? "cuenta activa está disponible" : "cuentas activas están disponibles"}.`
            : !state.sourceReady
              ? "Este paso se habilita cuando la fuente bancaria está validada."
              : state.accountsAvailable
                ? "Aún no hay cuentas activas. Revisa Cuentas antes de continuar."
                : "No se ha podido comprobar ahora la configuración de cuentas.",
          status: !state.sourceReady ? "Bloqueado" : !state.accountsAvailable ? "No disponible" : accountsReady ? "Completado" : "Pendiente",
          href: "/accounts",
          action: accountsReady ? "Ver cuentas" : "Configurar cuentas",
          blocked: !state.sourceReady,
        },
        {
          number: 3,
          name: "Primer resumen",
          description: summaryReady
            ? "El motor financiero central está disponible y mantiene la fuente bancaria en solo lectura."
            : !accountsReady
              ? "El resumen se habilita cuando la fuente y las cuentas están preparadas."
              : "No se ha podido confirmar ahora el primer resumen financiero.",
          status: !accountsReady ? "Bloqueado" : state.financialAvailable && state.financialReady ? "Listo" : "No disponible",
          href: "/",
          action: "Abrir resumen",
          blocked: !accountsReady,
        },
        {
          number: 4,
          name: "Pendientes",
          description: summaryReady
            ? "Para revisar reúne referencias vivas de los módulos propietarios para que decidas qué atender."
            : "Los pendientes se habilitan al completar el primer resumen.",
          status: summaryReady ? "Listo" : "Bloqueado",
          href: "/review",
          action: "Ver pendientes",
          blocked: !summaryReady,
        },
      ];

  const readyCount = steps.filter((step) => step.status === "Completado" || step.status === "Listo").length;

  return (
    <main className={styles.shell} aria-busy={loading}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PUESTA EN MARCHA</p>
          <h1>Primeros pasos</h1>
          <p>
            Sigue una secuencia corta basada únicamente en el estado real de Financial App. Cada paso abre el módulo propietario de los datos y respeta la fuente bancaria de solo lectura.
          </p>
        </div>
        <div className={styles.progress} aria-label="Progreso de primeros pasos">
          <strong>{loading ? "…" : `${readyCount}/4`}</strong>
          <span>{loading ? "Comprobando estado" : readyCount === 4 ? "Preparación completa" : "Pasos preparados"}</span>
        </div>
      </header>

      <section className={styles.steps} aria-label="Guía de primeros pasos">
        {steps.map((step) => (
          <article key={step.number} className={styles.card} aria-label={`Paso ${step.number} · ${step.name}`}>
            <div className={styles.cardHeader}>
              <span className={styles.stepNumber} aria-hidden="true">{step.number}</span>
              <div className={styles.cardTitle}>
                <p>Paso {step.number}</p>
                <h2>{step.name}</h2>
              </div>
              <span className={`${styles.status} ${statusClass(step.status)}`}>{step.status}</span>
            </div>
            <p className={styles.description}>{step.description}</p>
            {step.blocked ? (
              <span className={styles.blockedAction}>Completa el paso anterior</span>
            ) : (
              <Link className={styles.action} href={step.href}>{step.action}</Link>
            )}
          </article>
        ))}
      </section>

      <p className={styles.note}>
        Esta guía no guarda casillas ni duplica información financiera; solo refleja señales vivas de los módulos propietarios. Cualquier cambio se realiza en la sección correspondiente.
      </p>
    </main>
  );
}
