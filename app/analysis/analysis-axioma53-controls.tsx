"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import type { AnalysisSelectionInput } from "../../src/application/analysis/analysis-loader";
import styles from "./analysis-axioma53-controls.module.css";

type PeriodMode = "month" | "year" | "custom";
type CompareMode = "previous" | "year_ago" | "custom";

function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousDay(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function inferredPeriodMode(input: AnalysisSelectionInput, snapshot: AnalysisSnapshot | null): PeriodMode {
  if (input.periodMode === "year") return "year";
  if (input.periodMode === "custom") return "custom";
  if (input.periodMode === "month") return "month";
  if (input.dateFrom || input.dateTo) return "custom";
  if (input.range && input.range !== "1m") return "custom";
  if (snapshot?.selection.range && snapshot.selection.range !== "1m") return "custom";
  return "month";
}

function inferredCompareMode(input: AnalysisSelectionInput): CompareMode {
  if (input.compareMode === "year_ago" || input.compareMode === "custom") return input.compareMode;
  return "previous";
}

function formValue(data: FormData, name: string, fallback: string) {
  const value = data.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export default function AnalysisAxioma53Controls({
  snapshot,
  requested,
}: {
  snapshot: AnalysisSnapshot | null;
  requested: AnalysisSelectionInput;
}) {
  const today = useMemo(madridToday, []);
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);
  const resolved = snapshot?.selection;

  const [periodMode, setPeriodMode] = useState<PeriodMode>(() => inferredPeriodMode(requested, snapshot));
  const [month, setMonth] = useState(requested.month?.trim() || resolved?.month || currentMonth);
  const [year, setYear] = useState(requested.year?.trim() || resolved?.dateFrom.slice(0, 4) || currentYear);
  const [dateFrom, setDateFrom] = useState(requested.dateFrom?.trim() || resolved?.dateFrom || `${currentYear}-01-01`);
  const [dateTo, setDateTo] = useState(requested.dateTo?.trim() || resolved?.dateTo || today);
  const [accountId, setAccountId] = useState(requested.accountId?.trim() || resolved?.accountId || "");
  const [compareMode, setCompareMode] = useState<CompareMode>(() => inferredCompareMode(requested));
  const [compareDateFrom, setCompareDateFrom] = useState(requested.compareDateFrom?.trim() || resolved?.previousDateFrom || "");
  const [compareDateTo, setCompareDateTo] = useState(requested.compareDateTo?.trim() || resolved?.previousDateTo || "");

  const customComparisonMax = previousDay(periodMode === "custom" ? dateFrom : periodMode === "year" ? `${year}-01-01` : `${month}-01`);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const submittedMonth = formValue(data, "month", month);
    const submittedYear = formValue(data, "year", year);
    const submittedDateFrom = formValue(data, "dateFrom", dateFrom);
    const submittedDateTo = formValue(data, "dateTo", dateTo);
    const submittedAccountId = formValue(data, "accountId", accountId);
    const submittedCompareMode = formValue(data, "compareMode", compareMode) as CompareMode;
    const submittedCompareDateFrom = formValue(data, "compareDateFrom", compareDateFrom);
    const submittedCompareDateTo = formValue(data, "compareDateTo", compareDateTo);

    if (periodMode === "month") {
      params.set("month", submittedMonth);
      params.set("range", "1m");
      if (submittedCompareMode !== "previous") params.set("periodMode", "month");
    }
    if (periodMode === "year") {
      params.set("periodMode", "year");
      params.set("year", submittedYear);
    }
    if (periodMode === "custom") {
      params.set("periodMode", "custom");
      params.set("dateFrom", submittedDateFrom);
      params.set("dateTo", submittedDateTo);
    }
    if (submittedAccountId) params.set("accountId", submittedAccountId);
    if (submittedCompareMode !== "previous") params.set("compareMode", submittedCompareMode);
    if (submittedCompareMode === "custom") {
      params.set("compareDateFrom", submittedCompareDateFrom);
      params.set("compareDateTo", submittedCompareDateTo);
    }

    window.location.assign(`/analysis?${params.toString()}`);
  }

  return (
    <section className={styles.panel} aria-labelledby="analysis-period-heading">
      <div className={styles.heading}>
        <div>
          <span>AXIOMA §53 · PERIODO Y COMPARACIÓN</span>
          <h2 id="analysis-period-heading">Elige qué quieres analizar</h2>
        </div>
        <p>Todos los indicadores usan los mismos movimientos elegibles, exclusiones y correcciones que Movimientos.</p>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <fieldset className={styles.fieldset}>
          <legend>Periodo</legend>
          <div className={styles.segmented}>
            {([
              ["month", "Mes"],
              ["year", "Año"],
              ["custom", "Personalizado"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={periodMode === value ? styles.activeSegment : styles.segment}
                aria-label={value === "month" ? "1 mes" : label}
                aria-pressed={periodMode === value}
                onClick={() => setPeriodMode(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {periodMode === "month" && (
            <label className={styles.control}>
              <span>Mes de referencia</span>
              <input name="month" type="month" value={month} max={currentMonth} onChange={(event) => setMonth(event.target.value)} required />
            </label>
          )}
          {periodMode === "year" && (
            <label className={styles.control}>
              <span>Año</span>
              <input name="year" type="number" inputMode="numeric" min="2000" max={currentYear} step="1" value={year} onChange={(event) => setYear(event.target.value)} required />
            </label>
          )}
          {periodMode === "custom" && (
            <div className={styles.datePair}>
              <label className={styles.control}>
                <span>Desde</span>
                <input name="dateFrom" type="date" value={dateFrom} max={dateTo || today} onChange={(event) => setDateFrom(event.target.value)} required />
              </label>
              <label className={styles.control}>
                <span>Hasta</span>
                <input name="dateTo" type="date" value={dateTo} min={dateFrom} max={today} onChange={(event) => setDateTo(event.target.value)} required />
              </label>
            </div>
          )}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Comparar con</legend>
          <label className={styles.control}>
            <span>Referencia</span>
            <select name="compareMode" value={compareMode} onChange={(event) => setCompareMode(event.target.value as CompareMode)}>
              <option value="previous">Periodo anterior</option>
              <option value="year_ago">Año anterior</option>
              <option value="custom">Otro periodo</option>
            </select>
          </label>
          {compareMode === "custom" && (
            <div className={styles.datePair}>
              <label className={styles.control}>
                <span>Desde</span>
                <input name="compareDateFrom" type="date" value={compareDateFrom} max={compareDateTo || customComparisonMax} onChange={(event) => setCompareDateFrom(event.target.value)} required />
              </label>
              <label className={styles.control}>
                <span>Hasta</span>
                <input name="compareDateTo" type="date" value={compareDateTo} min={compareDateFrom} max={customComparisonMax} onChange={(event) => setCompareDateTo(event.target.value)} required />
              </label>
            </div>
          )}
        </fieldset>

        <label className={styles.control}>
          <span>Cuenta</span>
          <select name="accountId" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Todas las cuentas</option>
            {(snapshot?.accounts ?? []).map((account) => (
              <option value={account.id} key={account.id}>
                {account.name}{account.lifecycle === "archived" ? " · archivada" : ""}
              </option>
            ))}
          </select>
        </label>

        <button className={styles.apply} type="submit" aria-label="Aplicar">Aplicar análisis</button>
      </form>
    </section>
  );
}
