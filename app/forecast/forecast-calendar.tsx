"use client";

import { useMemo, useState } from "react";
import type { ForecastItem } from "../../src/application/forecast/forecast-contract";
import { formatMoneyCents } from "../../src/core/money";
import styles from "./forecast-calendar.module.css";

const dateLabel = new Intl.DateTimeFormat("es-ES", {
  day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid",
});
const monthLabel = new Intl.DateTimeFormat("es-ES", {
  month: "long", year: "numeric", timeZone: "Europe/Madrid",
});
const weekdays = ["L", "M", "X", "J", "V", "S", "D"];

function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}

function formattedDate(day: string) {
  return dateLabel.format(new Date(`${day}T12:00:00Z`));
}

function statusText(item: ForecastItem) {
  if (item.status === "confirmed") return "Conciliado con un movimiento real";
  if (item.status === "excluded") return "Excluido de la proyección";
  return "Previsto";
}

export function ForecastCalendar({ dateFrom, dateTo, items }: {
  dateFrom: string;
  dateTo: string;
  items: ForecastItem[];
}) {
  const firstMonth = dateFrom.slice(0, 7);
  const lastMonth = dateTo.slice(0, 7);
  const [requestedMonth, setRequestedMonth] = useState(firstMonth);
  const [requestedDate, setRequestedDate] = useState<string | null>(null);
  const month = requestedMonth < firstMonth || requestedMonth > lastMonth ? firstMonth : requestedMonth;
  const selectedDate = requestedDate?.startsWith(`${month}-`) && requestedDate >= dateFrom && requestedDate <= dateTo
    ? requestedDate : null;

  const byDate = useMemo(() => {
    const result = new Map<string, ForecastItem[]>();
    for (const item of items) {
      const group = result.get(item.date) ?? [];
      group.push(item);
      result.set(item.date, group);
    }
    return result;
  }, [items]);

  const [year, number] = month.split("-").map(Number);
  const offset = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const calendarDays = Array.from({ length: offset + daysInMonth }, (_, index) => {
    if (index < offset) return null;
    return `${month}-${String(index - offset + 1).padStart(2, "0")}`;
  });
  const selectedItems = selectedDate ? byDate.get(selectedDate) ?? [] : [];
  const selectedProjectedNetCents = selectedItems.reduce((sum, item) => sum + item.projectionEffectCents, 0);

  return (
    <section className={styles.calendar} aria-labelledby="forecast-calendar-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.kicker}>PREVISIÓN POR FECHA</p>
          <h2 id="forecast-calendar-title">Calendario de previsiones</h2>
          <p>Explora cobros y pagos previstos, conciliados o excluidos. Solo aparecen fechas incluidas en el periodo consultado.</p>
        </div>
        <div className={styles.monthControl} aria-label="Cambiar mes del calendario">
          <button type="button" aria-label="Mes anterior" disabled={month <= firstMonth} onClick={() => { setRequestedMonth(shiftMonth(month, -1)); setRequestedDate(null); }}>‹</button>
          <strong aria-live="polite">{monthLabel.format(new Date(`${month}-01T12:00:00Z`))}</strong>
          <button type="button" aria-label="Mes siguiente" disabled={month >= lastMonth} onClick={() => { setRequestedMonth(shiftMonth(month, 1)); setRequestedDate(null); }}>›</button>
        </div>
      </div>

      <div className={styles.viewport} role="group" aria-label={`Días de ${monthLabel.format(new Date(`${month}-01T12:00:00Z`))}`} tabIndex={0}>
        <div className={styles.weekdays} aria-hidden="true">
          {weekdays.map((weekday, index) => <span key={index}>{weekday}</span>)}
        </div>
        <div className={styles.days}>
          {calendarDays.map((day, index) => {
            if (!day) return <span key={`empty-${index}`} aria-hidden="true" />;
            const visible = day >= dateFrom && day <= dateTo;
            const events = byDate.get(day) ?? [];
            if (!visible) return <span key={day} className={styles.outside} aria-hidden="true">{Number(day.slice(-2))}</span>;
            const hasIncome = events.some((item) => item.amountCents > 0 && item.status === "planned");
            const hasExpense = events.some((item) => item.amountCents < 0 && item.status === "planned");
            const hasConfirmed = events.some((item) => item.status === "confirmed");
            const hasExcluded = events.some((item) => item.status === "excluded");
            return (
              <button
                key={day}
                type="button"
                className={`${styles.day} ${selectedDate === day ? styles.selected : ""}`}
                aria-label={`${formattedDate(day)}: ${events.length === 0 ? "sin previsiones" : [
                  `${events.length} ${events.length === 1 ? "previsión" : "previsiones"}`,
                  hasIncome ? "ingresos previstos" : null,
                  hasExpense ? "gastos previstos" : null,
                  hasConfirmed ? "conciliadas" : null,
                  hasExcluded ? "excluidas" : null,
                ].filter(Boolean).join(", ")}`}
                aria-pressed={selectedDate === day}
                onClick={() => setRequestedDate(day)}
              >
                <span>{Number(day.slice(-2))}</span>
                <span className={styles.signals} aria-hidden="true">
                  {hasIncome && <i className={styles.income} />}
                  {hasExpense && <i className={styles.expense} />}
                  {hasConfirmed && <i className={styles.confirmed} />}
                  {hasExcluded && <i className={styles.excluded} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.legend} aria-label="Leyenda del calendario">
        <span><i className={styles.income} /> Ingreso previsto</span>
        <span><i className={styles.expense} /> Gasto previsto</span>
        <span><i className={styles.confirmed} /> Conciliado</span>
        <span><i className={styles.excluded} /> Excluido</span>
      </div>

      {selectedDate ? (
        <div className={styles.detail} role="region" aria-label={`Detalle del ${formattedDate(selectedDate)}`}>
          <h3>{formattedDate(selectedDate)}</h3>
          {selectedItems.length > 0 ? (
            <>
              <p className={styles.dayNet}>Impacto en la proyección: <strong>{formatMoneyCents(selectedProjectedNetCents)}</strong></p>
              <ul>
                {selectedItems.map((item) => (
                  <li key={item.id}>
                    <div><strong>{item.concept}</strong><span>{statusText(item)}</span></div>
                    <div className={styles.detailEnd}><strong className={item.amountCents < 0 ? styles.negative : styles.positive}>{formatMoneyCents(item.amountCents)}</strong><a href={`#forecast-item-${item.id}`}>Ver detalle</a></div>
                    {item.actual ? <small>Movimiento real: {formattedDate(item.actual.date)} · {formatMoneyCents(item.actual.amountCents)}</small> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : <p>No hay previsiones para este día dentro del periodo consultado.</p>}
        </div>
      ) : <p className={styles.hint}>Selecciona un día para ver sus previsiones y acceder a las acciones disponibles.</p>}
    </section>
  );
}
