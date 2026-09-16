"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import styles from "./analysis-movement-insights.module.css";

const moneyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const shortDateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const BAND_LABELS: Record<string, string> = {
  lt10: "< 10 €",
  "10to25": "10–25 €",
  "25to50": "25–50 €",
  "50to100": "50–100 €",
  "100to250": "100–250 €",
  gte250: "≥ 250 €",
};
const BAND_ORDER = ["lt10", "10to25", "25to50", "50to100", "100to250", "gte250"] as const;

function formatMoney(cents: number) {
  return moneyFormatter.format(cents / 100);
}

function formatDate(value: string) {
  return shortDateFormatter.format(new Date(`${value}T12:00:00Z`)).replace(".", "");
}

function periodHref(snapshot: AnalysisSnapshot) {
  const params = new URLSearchParams({
    dateFrom: snapshot.selection.dateFrom,
    dateTo: snapshot.selection.dateTo,
    kind: "expense",
  });
  if (snapshot.selection.accountId) params.set("accountId", snapshot.selection.accountId);
  return `/transactions?${params.toString()}`;
}

function transactionHref(snapshot: AnalysisSnapshot, row: AnalysisSnapshot["topTransactions"][number]) {
  const params = new URLSearchParams({
    dateFrom: row.bankDate,
    dateTo: row.bankDate,
    kind: "expense",
  });
  if (row.accountId) params.set("accountId", row.accountId);
  if (row.merchantId) params.set("merchantId", row.merchantId);
  else if (row.categoryId) params.set("categoryId", row.categoryId);
  return `/transactions?${params.toString()}`;
}

function DailySpendChart({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const rows = snapshot.dailySpend;
  const chart = useMemo(() => {
    if (rows.length === 0) return null;
    const width = 760;
    const height = 220;
    const left = 42;
    const right = 12;
    const top = 16;
    const bottom = 30;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const maximum = Math.max(1, ...rows.map((row) => row.expenseCents));
    const step = rows.length > 1 ? innerWidth / (rows.length - 1) : innerWidth;
    const points = rows.map((row, index) => ({
      x: rows.length > 1 ? left + step * index : left + innerWidth / 2,
      y: top + (1 - row.expenseCents / maximum) * innerHeight,
      row,
    }));
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    return { width, height, left, right, top, bottom, maximum, points, path };
  }, [rows]);

  if (!chart) return <p className={styles.empty}>No hay gasto diario disponible en este periodo.</p>;

  return (
    <div className={styles.chartCard}>
      <div className={styles.cardHeading}>
        <div><span>RITMO DIARIO</span><strong>Cuándo se está concentrando el gasto</strong></div>
        <small>{rows.reduce((sum, row) => sum + row.rows, 0).toLocaleString("es-ES")} movimientos</small>
      </div>
      <div className={styles.svgViewport}>
        <svg className={styles.dailyChart} viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Evolución diaria del gasto del periodo">
          {[0, 0.5, 1].map((ratio) => {
            const y = chart.top + ratio * (chart.height - chart.top - chart.bottom);
            const value = Math.round(chart.maximum * (1 - ratio));
            return (
              <g key={ratio} className={styles.gridLine}>
                <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} />
                <text x={chart.left - 8} y={y + 4} textAnchor="end">{formatMoney(value)}</text>
              </g>
            );
          })}
          <path className={styles.dailyArea} d={`${chart.path} L ${chart.points.at(-1)?.x} ${chart.height - chart.bottom} L ${chart.points[0].x} ${chart.height - chart.bottom} Z`} />
          <path className={styles.dailyLine} d={chart.path} />
          {chart.points.map(({ x, y, row }, index) => (
            <g key={row.date}>
              <circle className={styles.dailyPoint} cx={x} cy={y} r="4"><title>{`${formatDate(row.date)} · ${formatMoney(row.expenseCents)} · ${row.rows} movimientos`}</title></circle>
              {(index === 0 || index === chart.points.length - 1 || index % Math.max(1, Math.ceil(chart.points.length / 6)) === 0) && (
                <text className={styles.axisLabel} x={x} y={chart.height - 8} textAnchor="middle">{formatDate(row.date)}</text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function SpendingCalendar({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const chart = useMemo(() => {
    const start = new Date(`${snapshot.selection.dateFrom}T12:00:00Z`);
    const end = new Date(`${snapshot.selection.dateTo}T12:00:00Z`);
    const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const firstWeekday = (start.getUTCDay() + 6) % 7;
    const byDate = new Map(snapshot.dailySpend.map((row) => [row.date, row]));
    const maximum = Math.max(1, ...snapshot.dailySpend.map((row) => row.expenseCents));
    const cell = 12;
    const gap = 3;
    const left = 22;
    const top = 16;
    const weeks = Math.ceil((firstWeekday + totalDays) / 7);
    const days = Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const offset = firstWeekday + index;
      const week = Math.floor(offset / 7);
      const weekday = offset % 7;
      const row = byDate.get(key);
      return {
        key,
        week,
        weekday,
        expenseCents: row?.expenseCents ?? 0,
        rows: row?.rows ?? 0,
      };
    });
    return {
      days,
      maximum,
      cell,
      gap,
      left,
      top,
      width: Math.max(220, left + weeks * (cell + gap) + 12),
      height: top + 7 * (cell + gap) + 18,
    };
  }, [snapshot.dailySpend, snapshot.selection.dateFrom, snapshot.selection.dateTo]);

  return (
    <div className={styles.chartCard}>
      <div className={styles.cardHeading}>
        <div><span>MAPA DE CALOR</span><strong>Qué días concentran más intensidad de gasto</strong></div>
      </div>
      <div className={styles.svgViewport}>
        <svg className={styles.dailyChart} viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Mapa de calor diario del gasto">
          {WEEKDAYS.map((label, index) => (
            <text key={label} className={styles.axisLabel} x={7} y={chart.top + index * (chart.cell + chart.gap) + chart.cell - 2}>{label}</text>
          ))}
          {chart.days.map((day) => {
            const intensity = day.expenseCents > 0 ? 0.2 + 0.8 * (day.expenseCents / chart.maximum) : 0.07;
            return (
              <rect
                key={day.key}
                className={styles.dailyPoint}
                x={chart.left + day.week * (chart.cell + chart.gap)}
                y={chart.top + day.weekday * (chart.cell + chart.gap)}
                width={chart.cell}
                height={chart.cell}
                rx="2"
                style={{ opacity: intensity }}
              >
                <title>{`${formatDate(day.key)} · ${formatMoney(day.expenseCents)} · ${day.rows} movimientos`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function WeekdayChart({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const byDay = new Map(snapshot.weekdaySpend.map((row) => [row.weekday, row]));
  const rows = WEEKDAYS.map((label, index) => ({
    label,
    weekday: index + 1,
    expenseCents: byDay.get(index + 1)?.expenseCents ?? 0,
    rows: byDay.get(index + 1)?.rows ?? 0,
    averageCents: byDay.get(index + 1)?.averageCents ?? 0,
  }));
  const maximum = Math.max(1, ...rows.map((row) => row.expenseCents));

  return (
    <div className={styles.chartCard}>
      <div className={styles.cardHeading}>
        <div><span>DÍA DE LA SEMANA</span><strong>Qué días pesan más en el gasto</strong></div>
      </div>
      <div className={styles.weekdayChart} role="img" aria-label="Gasto por día de la semana">
        {rows.map((row) => (
          <div key={row.weekday} className={styles.weekdayColumn} title={`${row.label}: ${formatMoney(row.expenseCents)} · ${row.rows} movimientos · media ${formatMoney(row.averageCents)}`}>
            <div><i style={{ height: `${Math.max(row.expenseCents > 0 ? 5 : 0, (row.expenseCents / maximum) * 100)}%` }} /></div>
            <strong>{row.label}</strong>
            <small>{row.rows}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function AmountBandsChart({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const source = new Map(snapshot.amountBands.map((row) => [row.band, row]));
  const rows = BAND_ORDER.map((band) => ({ band, ...(source.get(band) ?? { expenseCents: 0, rows: 0 }) }));
  const maximum = Math.max(1, ...rows.map((row) => row.rows));

  return (
    <div className={styles.chartCard}>
      <div className={styles.cardHeading}>
        <div><span>TRAMOS DE IMPORTE</span><strong>Cómo son tus compras</strong></div>
      </div>
      <div className={styles.bandChart} role="img" aria-label="Distribución de movimientos por tramo de importe">
        {rows.map((row) => (
          <div key={row.band} className={styles.bandRow}>
            <span>{BAND_LABELS[row.band]}</span>
            <div><i style={{ width: `${Math.max(row.rows > 0 ? 3 : 0, (row.rows / maximum) * 100)}%` }} /></div>
            <strong>{row.rows.toLocaleString("es-ES")}</strong>
            <small>{formatMoney(row.expenseCents)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function MerchantScatter({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const rows = snapshot.merchantDrivers
    .filter((row) => row.rows > 0 && (row.averageCents ?? 0) > 0)
    .slice(0, 18);
  if (rows.length === 0) return <p className={styles.empty}>No hay comercios suficientes para esta lectura.</p>;

  const width = 520;
  const height = 250;
  const left = 42;
  const right = 20;
  const top = 18;
  const bottom = 34;
  const maxRows = Math.max(1, ...rows.map((row) => row.rows));
  const maxAverage = Math.max(1, ...rows.map((row) => row.averageCents ?? 0));

  return (
    <div className={styles.chartCard}>
      <div className={styles.cardHeading}>
        <div><span>FRECUENCIA × IMPORTE</span><strong>Comercios frecuentes frente a compras grandes</strong></div>
      </div>
      <div className={styles.svgViewport}>
        <svg className={styles.scatterChart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Relación entre frecuencia de compra e importe medio por comercio">
          <line className={styles.scatterAxis} x1={left} x2={left} y1={top} y2={height - bottom} />
          <line className={styles.scatterAxis} x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} />
          <text className={styles.axisLabel} x={width / 2} y={height - 6} textAnchor="middle">Frecuencia de compra</text>
          <text className={styles.axisLabel} x={8} y={top + 8}>Importe medio</text>
          {rows.map((row) => {
            const x = left + (row.rows / maxRows) * (width - left - right);
            const y = top + (1 - (row.averageCents ?? 0) / maxAverage) * (height - top - bottom);
            const radius = 5 + Math.min(7, ((row.shareBps ?? 0) / 10000) * 18);
            return (
              <circle key={`${row.id ?? "none"}-${row.name}`} className={styles.scatterPoint} cx={x} cy={y} r={radius}>
                <title>{`${row.name} · ${row.rows} movimientos · media ${formatMoney(row.averageCents ?? 0)} · total ${formatMoney(row.expenseCents)}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function Concepts({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const rows = snapshot.concepts.slice(0, 8);
  const maximum = Math.max(1, ...rows.map((row) => row.expenseCents));
  if (rows.length === 0) return <p className={styles.empty}>No hay conceptos de gasto disponibles.</p>;

  return (
    <div className={styles.detailCard}>
      <div className={styles.cardHeading}>
        <div><span>CONCEPTOS</span><strong>Qué descripciones concentran más gasto</strong></div>
      </div>
      <div className={styles.conceptList}>
        {rows.map((row) => (
          <div key={row.concept} className={styles.conceptRow}>
            <div><strong>{row.concept}</strong><small>{row.rows.toLocaleString("es-ES")} mov. · media {formatMoney(row.averageCents)}</small></div>
            <div className={styles.conceptTrack}><i style={{ width: `${Math.max(3, (row.expenseCents / maximum) * 100)}%` }} /></div>
            <b>{formatMoney(row.expenseCents)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopTransactions({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const rows = snapshot.topTransactions;
  if (rows.length === 0) return <p className={styles.empty}>No hay movimientos destacados disponibles.</p>;

  return (
    <div className={styles.detailCard}>
      <div className={styles.cardHeading}>
        <div><span>MOVIMIENTOS DE MAYOR IMPACTO</span><strong>Detalle enlazado con el movimiento original</strong></div>
        <small>Top {rows.length.toLocaleString("es-ES")}</small>
      </div>
      <div className={styles.transactionList}>
        {rows.map((row) => (
          <Link key={row.transactionId} href={transactionHref(snapshot, row)} className={styles.transactionRow}>
            <div className={styles.transactionMain}>
              <strong>{row.conceptNormalized}</strong>
              <span>{formatDate(row.bankDate)} · {row.merchantName} · {row.categoryName}</span>
              <small>{row.accountName}</small>
            </div>
            <b>{formatMoney(row.amountCents)}</b>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function AnalysisMovementInsights({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const available = snapshot.dailySpend.length > 0
    || snapshot.weekdaySpend.length > 0
    || snapshot.amountBands.length > 0
    || snapshot.concepts.length > 0
    || snapshot.topTransactions.length > 0;

  if (!available) return null;

  return (
    <section className={styles.shell} aria-labelledby="movement-insights-heading">
      <div className={styles.heading}>
        <div>
          <p>DETALLE DE LOS MOVIMIENTOS</p>
          <h2 id="movement-insights-heading">Patrones que no se ven en un simple total</h2>
          <span>Las gráficas se calculan con los mismos movimientos elegibles del periodo y conservan filtros, exclusiones y correcciones.</span>
        </div>
        <Link href={periodHref(snapshot)}>Ver todos los movimientos</Link>
      </div>

      <div className={styles.heroGrid}>
        <DailySpendChart snapshot={snapshot} />
        <WeekdayChart snapshot={snapshot} />
      </div>

      <div className={styles.chartGrid}>
        <SpendingCalendar snapshot={snapshot} />
        <AmountBandsChart snapshot={snapshot} />
        <MerchantScatter snapshot={snapshot} />
      </div>

      {snapshot.accountSpend.length > 1 && (
        <div className={styles.accountStrip} aria-label="Gasto por cuenta">
          {snapshot.accountSpend.map((row) => (
            <div key={row.accountId}>
              <span>{row.accountName}</span>
              <strong>{formatMoney(row.expenseCents)}</strong>
              <small>{row.rows.toLocaleString("es-ES")} mov. · media {formatMoney(row.averageCents)}</small>
            </div>
          ))}
        </div>
      )}

      <div className={styles.detailGrid}>
        <Concepts snapshot={snapshot} />
        <TopTransactions snapshot={snapshot} />
      </div>
    </section>
  );
}