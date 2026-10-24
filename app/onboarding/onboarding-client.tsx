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

type DashboardReadiness = {
  contractVersion?: number;
  failedSources?: string[];
  data?: Record<string, unknown>;
};

type BalanceReadiness = {
  rows?: Array<{ accounts?: number }>;
  principles?: {
    bankSource?: string;
    balanceSource?: string;
    cashFlowReconstruction?: boolean;
    getHasSideEffects?: boolean;
  };
};

const DASHBOARD_COMPONENTS = [
  ["financial", "resumen financiero"],
  ["transactions", "actividad reciente"],
  ["monthly", "evolución mensual"],
  ["budgets", "presupuestos"],
  ["forecast", "previsión"],
] as const;

function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function balanceDateFrom(today: string) {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 12, 1));
  return date.toISOString().slice(0, 10);
}

function summaryComponentsMissing(dashboard: DashboardReadiness | null, balance: BalanceReadiness | null) {
  const missing: string[] = [];
  if (dashboard?.contractVersion !== 1 || !dashboard.data) {
    missing.push("componentes del resumen");
  } else {
    for (const [source, label] of DASHBOARD_COMPONENTS) {
      if (dashboard.failedSources?.includes(source) || !dashboard.data[source]) missing.push(label);
    }
  }
  const balanceValid = balance?.principles?.bankSource === "read_only"
    && balance.principles.balanceSource === "financial_account_balances"
    && balance.principles.cashFlowReconstruction === false
    && balance.principles.getHasSideEffects === false
    && Array.isArray(balance.rows)
    && balance.rows.some((row) => Number.isInteger(row.accounts) && row.accounts! > 0);
  if (!balanceValid) missing.push("evolución del saldo");
  return missing;
}

type OnboardingState = {
  sourceAvailable: boolean;
  sourceConnected: boolean;
  sourceReady: boolean;
  accountsAvailable: boolean;
  activeAccounts: number;
  financialAvailable: boolean;
  financialReady: boolean;
  summaryMissing: string[];
};

type StepStatus = "Comprobando…" | "Completado" | "Parcial" | "Siguiente" | "Pendiente" | "Bloqueado" | "No disponible";

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
  summaryMissing: [],
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
  if (status === "Siguiente" || status === "Pendiente" || status === "Parcial") return styles.pending;
  if (status === "No disponible") return styles.unavailable;
  if (status === "Bloqueado") return styles.blocked;
  return styles.checking;
}

export default function OnboardingClient() {
  const [loading, setLoading] = useState(true);
  const [slowLoading, setSlowLoading] = useState(false);
  const [readDeadlineReached, setReadDeadlineReached] = useState(false);
  const [state, setState] = useState<OnboardingState>(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    let timedOut = false;
    const slowTimer = window.setTimeout(() => {
      if (mounted) setSlowLoading(true);
    }, 15_000);
    const deadlineTimer = window.setTimeout(() => {
      if (!mounted || controller.signal.aborted) return;
      timedOut = true;
      controller.abort();
      setReadDeadlineReached(true);
      setLoading(false);
    }, 30_000);

    void (async () => {
      const [sourceResult, syncResult, configurationResult] = await Promise.allSettled([
        readJson<GoogleStatus>("/api/source/google/status", controller.signal),
        readJson<SyncStatus>("/api/source/google/sync", controller.signal),
        readJson<Configuration>("/api/configuration", controller.signal),
      ] as const);

      if (!mounted || (controller.signal.aborted && !timedOut)) return;

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

      // Conservar resultados iniciales aunque la lectura secundaria tarde o falle.
      setState((current) => ({
        ...current, sourceAvailable, sourceConnected, sourceReady,
        accountsAvailable, activeAccounts,
      }));

      let financialAvailable = false;
      let financialReady = false;
      let summaryMissing: string[] = [];
      if (sourceReady && accountsAvailable && activeAccounts > 0) {
        const today = madridToday();
        const balanceParams = new URLSearchParams({
          mode: "balance_series",
          dateFrom: balanceDateFrom(today),
          dateTo: today,
        });
        const [financialResult, dashboardResult, balanceResult] = await Promise.allSettled([
          readJson<FinancialSnapshot>("/api/financial?mode=snapshot", controller.signal),
          readJson<DashboardReadiness>("/api/dashboard?scope=all", controller.signal),
          readJson<BalanceReadiness>(`/api/financial?${balanceParams.toString()}`, controller.signal),
        ]);
        if (!mounted || (controller.signal.aborted && !timedOut)) return;
        const financial = fulfilled(financialResult);
        financialAvailable = financial !== null;
        financialReady = financial?.contractVersion === 1 && financial.principles?.bankSource === "read_only";
        summaryMissing = summaryComponentsMissing(fulfilled(dashboardResult), fulfilled(balanceResult));
      }

      if (!mounted) return;
      setState({
        sourceAvailable,
        sourceConnected,
        sourceReady,
        accountsAvailable,
        activeAccounts,
        financialAvailable,
        financialReady,
        summaryMissing,
      });
      setLoading(false);
    })().catch(() => {
      if (mounted) setLoading(false);
    }).finally(() => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(deadlineTimer);
      if (mounted && !timedOut) setSlowLoading(false);
    });

    return () => {
      mounted = false;
      window.clearTimeout(slowTimer);
      window.clearTimeout(deadlineTimer);
      controller.abort();
    };
  }, []);

  const accountsReady = state.sourceReady && state.accountsAvailable && state.activeAccounts > 0;
  const summaryReady = accountsReady && state.financialReady && state.summaryMissing.length === 0;
  const summaryPartial = accountsReady && state.financialReady && state.summaryMissing.length > 0;

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
        : summaryPartial
          ? "Parcial"
          : state.financialAvailable
            ? "Siguiente"
            : "No disponible";
    const step5Status: StepStatus = summaryReady || summaryPartial ? "Siguiente" : "Bloqueado";

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
          ? "Resumen y evolución del saldo disponibles: puedes consultar una visión conjunta de tus datos."
          : !accountsReady
            ? "El resumen se habilita cuando los datos y las cuentas están preparados."
            : summaryPartial
              ? `Resumen parcial: pendiente ${state.summaryMissing.join(", ")}. En Inicio puedes consultar las partes disponibles; no se presentan como completas.`
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
        description: summaryReady || summaryPartial
          ? "Para revisar reúne las decisiones disponibles aunque otra sección del resumen siga pendiente."
          : "Cuando el primer resumen esté listo, Financial App te llevará a los elementos que requieren una decisión.",
        status: step5Status,
        href: "/review",
        action: "Ver qué necesita atención",
        blocked: !summaryReady && !summaryPartial,
      },
    ];
  }, [accountsReady, loading, state, summaryReady, summaryPartial]);

  const completedCount = steps.filter((step) => step.status === "Completado").length;
  const activationComplete = !loading && summaryReady;
  const nextStep = steps.find((step) => step.status === "Parcial")
    ?? steps.find((step) => step.status === "Siguiente")
    ?? steps.find((step) => !step.blocked && step.status !== "Completado")
    ?? null;

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
        <div className={styles.progress} role="group" aria-label="Progreso de puesta en marcha">
          <strong>{loading ? "…" : `${completedCount}/5`}</strong>
          <span>{loading ? "Comprobando tu estado" : activationComplete ? "Ya puedes usar tu resumen" : "Objetivos completados"}</span>
        </div>
      </header>

      {loading && slowLoading ? (
        <p role="status" aria-live="polite">
          La comprobación está tardando más de 15 segundos. Seguimos leyendo las secciones disponibles sin cambiar tus datos.
        </p>
      ) : null}
      {readDeadlineReached ? (
        <p role="status" aria-live="polite">
          La comprobación ha superado 30 segundos. Se muestran únicamente los resultados verificados; abre el módulo pendiente para volver a comprobarlo.
        </p>
      ) : null}

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
