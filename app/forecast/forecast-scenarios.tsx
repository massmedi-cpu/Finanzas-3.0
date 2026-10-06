"use client";

import { useEffect, useMemo, useState } from "react";
import type { ForecastSnapshot } from "../../src/application/forecast/forecast-contract";
import {
  buildForecastScenarios,
  DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS,
  FORECAST_SCENARIO_STORAGE_KEY,
  normalizeForecastScenarioAssumptions,
  normalizeForecastScenarioPercent,
  type EditableForecastScenarioAssumptions,
} from "../../src/application/forecast/forecast-scenarios";
import { formatMoneyCents } from "../../src/core/money";
import styles from "./forecast-scenarios.module.css";

const LABELS = {
  expected: {
    title: "Esperado",
    description: "La previsión canónica actual, sin aplicar ninguna hipótesis adicional.",
  },
  conservative: {
    title: "Conservador",
    description: "Simula menos ingresos y/o más gastos según las hipótesis que elijas.",
  },
  optimistic: {
    title: "Optimista",
    description: "Simula más ingresos y/o menos gastos según las hipótesis que elijas.",
  },
} as const;

function signedPercent(value: number) {
  if (value === 0) return "0 %";
  return `${value > 0 ? "+" : ""}${value} %`;
}

export function ForecastScenarios({ snapshot }: { snapshot: ForecastSnapshot }) {
  const [assumptions, setAssumptions] = useState<EditableForecastScenarioAssumptions>(
    DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS,
  );
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FORECAST_SCENARIO_STORAGE_KEY);
      if (stored) setAssumptions(normalizeForecastScenarioAssumptions(JSON.parse(stored)));
    } catch {
      // A corrupt or unavailable local preference must never block the canonical forecast.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(FORECAST_SCENARIO_STORAGE_KEY, JSON.stringify(assumptions));
    } catch {
      // Scenario preferences are optional; forecast data remains canonical and server-owned.
    }
  }, [assumptions, storageReady]);

  const scenarios = useMemo(
    () => buildForecastScenarios(snapshot, assumptions),
    [assumptions, snapshot],
  );

  function updateAssumption(
    scenario: keyof EditableForecastScenarioAssumptions,
    field: "incomeAdjustmentPercent" | "expenseAdjustmentPercent",
    rawValue: string,
  ) {
    setAssumptions((current) => ({
      ...current,
      [scenario]: {
        ...current[scenario],
        [field]: normalizeForecastScenarioPercent(rawValue, current[scenario][field]),
      },
    }));
  }

  function resetAssumptions() {
    setAssumptions(DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS);
  }

  return (
    <section className={styles.root} aria-labelledby="forecast-scenarios-title" data-testid="forecast-scenarios">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>ESCENARIOS</p>
          <h2 id="forecast-scenarios-title">¿Qué pasaría si cambian tus ingresos o gastos?</h2>
          <p className={styles.lead}>
            Compara el escenario esperado con alternativas conservadora y optimista. Las hipótesis solo simulan
            el resultado sobre la previsión actual: no crean movimientos, no cambian recurrencias y no modifican
            la fuente bancaria.
          </p>
        </div>
        <button type="button" className={styles.resetButton} onClick={resetAssumptions}>
          Restablecer hipótesis
        </button>
      </div>

      <div className={styles.grid}>
        {scenarios.map((scenario) => {
          const labels = LABELS[scenario.key];
          const editableKey = scenario.key === "conservative" || scenario.key === "optimistic"
            ? scenario.key
            : null;
          return (
            <article className={styles.card} key={scenario.key} data-scenario={scenario.key}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.scenarioLabel}>{labels.title}</span>
                  <p>{labels.description}</p>
                </div>
                <strong className={scenario.netCents < 0 ? styles.negative : styles.positive}>
                  {formatMoneyCents(scenario.closingBalanceCents)}
                </strong>
              </div>

              <dl className={styles.metrics}>
                <div><dt>Ingresos</dt><dd>{formatMoneyCents(scenario.incomeCents)}</dd></div>
                <div><dt>Gastos</dt><dd>{formatMoneyCents(scenario.expenseCents)}</dd></div>
                <div><dt>Neto</dt><dd>{formatMoneyCents(scenario.netCents)}</dd></div>
                <div><dt>Saldo final</dt><dd>{formatMoneyCents(scenario.closingBalanceCents)}</dd></div>
              </dl>

              {editableKey ? (
                <fieldset className={styles.assumptions}>
                  <legend>Hipótesis editables</legend>
                  <label>
                    <span>Ingresos</span>
                    <span className={styles.inputWrap}>
                      <input
                        aria-label={`Ingresos · ${labels.title} (%)`}
                        type="number"
                        inputMode="numeric"
                        min="-100"
                        max="100"
                        step="1"
                        value={scenario.assumptions.incomeAdjustmentPercent}
                        onChange={(event) => updateAssumption(
                          editableKey,
                          "incomeAdjustmentPercent",
                          event.target.value,
                        )}
                      />
                      <span>%</span>
                    </span>
                  </label>
                  <label>
                    <span>Gastos</span>
                    <span className={styles.inputWrap}>
                      <input
                        aria-label={`Gastos · ${labels.title} (%)`}
                        type="number"
                        inputMode="numeric"
                        min="-100"
                        max="100"
                        step="1"
                        value={scenario.assumptions.expenseAdjustmentPercent}
                        onChange={(event) => updateAssumption(
                          editableKey,
                          "expenseAdjustmentPercent",
                          event.target.value,
                        )}
                      />
                      <span>%</span>
                    </span>
                  </label>
                  <p className={styles.assumptionSummary}>
                    Ingresos {signedPercent(scenario.assumptions.incomeAdjustmentPercent)} · Gastos{" "}
                    {signedPercent(scenario.assumptions.expenseAdjustmentPercent)}
                  </p>
                </fieldset>
              ) : (
                <div className={styles.canonicalNote}>
                  <strong>Base canónica</strong>
                  <span>Usa exactamente las cifras calculadas por el motor de Previsión.</span>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className={styles.safetyNote} role="note">
        Simulación local y reversible. Solo se guardan tus porcentajes de escenario en este navegador; los datos
        financieros, previsiones y movimientos permanecen intactos.
      </p>
    </section>
  );
}
