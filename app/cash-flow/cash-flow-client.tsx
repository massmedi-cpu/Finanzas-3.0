"use client";

import Link from "next/link";
import { useState } from "react";
import type { CashFlowDay, CashFlowView } from "../../src/application/cash-flow/cash-flow-model";
import { shiftCashFlowMonth, countsInCashFlow } from "../../src/application/cash-flow/cash-flow-model";
import { formatMoneyCents } from "../../src/core/money";
import styles from "./cash-flow.module.css";

const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long", year: "numeric", timeZone: "Europe/Madrid",
});
const dayFormatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid",
});
const weekdays = ["L", "M", "X", "J", "V", "S", "D"];

function formatDate(date: string) {
  return dayFormatter.format(new Date(`${date}T12:00:00Z`));
}

function monthName(month: string) {
  return monthFormatter.format(new Date(`${month}-01T12:00:00Z`));
}

function realStatus(state: CashFlowView["actualState"]) {
  if (state === "incomplete") return "Hay más de 2.000 movimientos o cambió la paginación. El detalle diario real no se muestra como completo.";
  if (state === "mismatch") return "El detalle real no concilia con el motor financiero. No se muestran netos diarios hasta revisar la diferencia.";
  return "No se han podido cargar juntos el resumen financiero y los movimientos reales. No se muestran importes reales.";
}

function forecastStatus(state: CashFlowView["forecastState"]) {
  return state === "mismatch"
    ? "Los importes por fecha no concilian con el resumen del motor de Previsión. No se muestran netos previstos."
    : "No se pudo cargar el motor de Previsión. Los importes previstos no están disponibles.";
}

function daySignals(day: CashFlowDay, actualReady: boolean, forecastReady: boolean) {
  return [
    actualReady && day.realIncomeCents > 0 ? "entradas reales" : null,
    actualReady && day.realExpenseCents < 0 ? "salidas reales" : null,
    forecastReady && day.plannedIncomeCents > 0 ? "entradas previstas" : null,
    forecastReady && day.plannedExpenseCents < 0 ? "salidas previstas" : null,
    forecastReady && day.forecasts.some((item) => item.status === "confirmed") ? "previsiones conciliadas" : null,
    forecastReady && day.forecasts.some((item) => item.status === "excluded") ? "previsiones descartadas" : null,
  ].filter(Boolean).join(", ");
}

function forecastLabel(status: CashFlowDay["forecasts"][number]["status"]) {
  if (status === "confirmed") return "Conciliado con un movimiento real";
  if (status === "excluded") return "Descartado de la proyección";
  return "Pendiente previsto";
}

export function CashFlowClient({ view }: { view: CashFlowView & { invalidMonth: boolean } }) {
  const [selected, setSelected] = useState<string | null>(null);
  const actualReady = view.actualState === "ready";
  const forecastReady = view.forecastState === "ready";
  const selectedDay = view.days.find((day) => day.date === selected) ?? null;
  const offset = (new Date(`${view.dateFrom}T12:00:00Z`).getUTCDay() + 6) % 7;
  const combined = view.actualNetCents !== null && view.plannedNetCents !== null
    ? view.actualNetCents + view.plannedNetCents : null;
  const nextMonth = shiftCashFlowMonth(view.month, 1);
  const previousMonth = shiftCashFlowMonth(view.month, -1);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>FINANCIAL APP · DINERO EN EL TIEMPO</p>
          <h1>Cash Flow</h1>
          <p>Qué dinero entró, qué salió y qué está previsto. Los hechos bancarios usan su fecha real; las previsiones mantienen su fecha estimada.</p>
        </div>
        <Link prefetch={false} href="/forecast" className={styles.heroLink}>Gestionar previsiones</Link>
      </header>

      <section className={styles.monthBar} aria-label="Mes de Cash Flow">
        <Link prefetch={false} href={`?month=${previousMonth}`} aria-label={`Mes anterior: ${monthName(previousMonth)}`}>‹</Link>
        <div><span>Mes consultado</span><strong>{monthName(view.month)}</strong></div>
        <Link prefetch={false} href={`?month=${nextMonth}`} aria-label={`Mes siguiente: ${monthName(nextMonth)}`}>›</Link>
      </section>
      {view.invalidMonth ? <p className={styles.notice} role="status">El mes solicitado no era válido; se muestra el mes actual.</p> : null}

      <section className={styles.kpis} aria-label="Resumen de Cash Flow">
        <article><span>Neto real</span><strong>{view.actualNetCents === null ? "—" : formatMoneyCents(view.actualNetCents)}</strong><small>Motor financiero · fecha bancaria · sin transferencias internas</small></article>
        <article><span>Pendiente previsto</span><strong>{view.plannedNetCents === null ? "—" : formatMoneyCents(view.plannedNetCents)}</strong><small>Conciliados y descartados aportan cero a la proyección</small></article>
        <article className={styles.combined}><span>Real + pendiente previsto</span><strong>{combined === null ? "—" : formatMoneyCents(combined)}</strong><small>Resultado potencial del mes; no equivale al saldo de tus cuentas</small></article>
      </section>

      {view.actualState !== "ready" ? <p className={styles.warning} role="alert">{realStatus(view.actualState)} <Link prefetch={false} href={`/transactions?dateFrom=${view.dateFrom}&dateTo=${view.dateTo}`}>Abrir Movimientos</Link></p> : null}
      {view.forecastState !== "ready" ? <p className={styles.warning} role="alert">{forecastStatus(view.forecastState)} <Link prefetch={false} href={`/forecast?dateFrom=${view.dateFrom}&dateTo=${view.dateTo}`}>Abrir Previsión</Link></p> : null}

      <section className={styles.calendar} aria-labelledby="cash-flow-calendar-title">
        <div className={styles.sectionTitle}>
          <div><p className={styles.eyebrow}>FECHA REAL Y FECHA ESTIMADA</p><h2 id="cash-flow-calendar-title">Calendario diario</h2></div>
          <p>Selecciona un día para ver los movimientos y las previsiones con su procedencia.</p>
        </div>
        <div className={styles.calendarViewport} role="group" aria-label={`Días de ${monthName(view.month)}`} tabIndex={0}>
          <div className={styles.weekdays} aria-hidden="true">{weekdays.map((label, index) => <span key={index}>{label}</span>)}</div>
          <div className={styles.days}>
            {Array.from({ length: offset }, (_, index) => <span key={`offset-${index}`} aria-hidden="true" />)}
            {view.days.map((day) => {
              const signals = daySignals(day, actualReady, forecastReady);
              const realCount = actualReady ? day.real.filter(countsInCashFlow).length : null;
              const plannedCount = forecastReady ? day.forecasts.filter((item) => item.status === "planned").length : null;
              return (
                <button key={day.date} type="button" className={`${styles.day} ${selected === day.date ? styles.active : ""}`}
                  aria-label={`${formatDate(day.date)}: ${signals || (actualReady && forecastReady ? "sin actividad registrada" : "datos incompletos")}`}
                  aria-pressed={selected === day.date} onClick={() => setSelected(day.date)}>
                  <strong>{Number(day.date.slice(-2))}</strong>
                  <span className={styles.dayCounts}>{realCount || plannedCount
                    ? [realCount ? `${realCount} real` : null, plannedCount ? `${plannedCount} prev.` : null].filter(Boolean).join(" · ")
                    : realCount === null || plannedCount === null ? "Datos incompletos" : "—"}</span>
                  <span className={styles.signals} aria-hidden="true">
                    {actualReady && day.real.some((row) => countsInCashFlow(row) && row.amountCents > 0) ? <i className={styles.realIncome} /> : null}
                    {actualReady && day.real.some((row) => countsInCashFlow(row) && row.amountCents < 0) ? <i className={styles.realExpense} /> : null}
                    {forecastReady && day.forecasts.some((item) => item.projectionEffectCents !== 0) ? <i className={styles.planned} /> : null}
                    {forecastReady && day.forecasts.some((item) => item.status === "confirmed") ? <i className={styles.confirmed} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.legend} aria-label="Leyenda del Cash Flow">
          <span><i className={styles.realIncome} /> Entrada real</span><span><i className={styles.realExpense} /> Salida real</span>
          <span><i className={styles.planned} /> Pendiente previsto</span><span><i className={styles.confirmed} /> Conciliado</span>
        </div>
        {selectedDay ? (
          <div className={styles.detail} role="region" aria-label={`Detalle del ${formatDate(selectedDay.date)}`}>
            <div className={styles.detailTitle}><h3>{formatDate(selectedDay.date)}</h3><Link prefetch={false} href={`/transactions?dateFrom=${selectedDay.date}&dateTo=${selectedDay.date}`}>Ver todos los movimientos</Link></div>
            <div className={styles.dayTotals}>
              <p>Real <strong>{actualReady ? formatMoneyCents(selectedDay.realNetCents) : "—"}</strong></p>
              <p>Pendiente previsto <strong>{forecastReady ? formatMoneyCents(selectedDay.plannedNetCents) : "—"}</strong></p>
            </div>
            {actualReady && selectedDay.real.length > 0 ? (
              <div className={styles.group}><h4>Movimientos bancarios · fecha real</h4><ul>{selectedDay.real.map((row) => (
                <li key={row.id}>
                  <div><strong>{row.concept.effective}</strong><small>{row.account.name} · {row.kind.effective === "transfer" ? "Transferencia" : countsInCashFlow(row) ? "Incluido en neto real" : "No incluido en neto real"}</small></div>
                  <strong className={row.amountCents < 0 ? styles.negative : styles.positive}>{formatMoneyCents(row.amountCents)}</strong>
                </li>
              ))}</ul></div>
            ) : actualReady ? <p className={styles.empty}>No hay movimientos bancarios en este día.</p> : null}
            {forecastReady && selectedDay.forecasts.length > 0 ? (
              <div className={styles.group}><h4>Previsiones · fecha estimada</h4><ul>{selectedDay.forecasts.map((item) => (
                <li key={item.id}>
                  <div><strong>{item.concept}</strong><small>{forecastLabel(item.status)}{item.actual ? ` · realizado el ${formatDate(item.actual.date)}` : ""}</small>
                    <Link prefetch={false} href={`/forecast?dateFrom=${view.dateFrom}&dateTo=${view.dateTo}#forecast-item-${item.id}`}>Ver y gestionar</Link>
                  </div>
                  <strong className={item.amountCents < 0 ? styles.negative : styles.positive}>{formatMoneyCents(item.amountCents)}</strong>
                </li>
              ))}</ul></div>
            ) : forecastReady ? <p className={styles.empty}>No hay previsiones para este día.</p> : null}
          </div>
        ) : <p className={styles.hint}>Selecciona un día para ver el detalle y abrir las acciones pertinentes.</p>}
      </section>
      <p className={styles.method}>El neto real coincide con el motor financiero o se oculta si no concilia. La proyección cuenta solo importes pendientes. Las transferencias internas, duplicados confirmados y filas excluidas no inflan el neto.</p>
    </main>
  );
}
