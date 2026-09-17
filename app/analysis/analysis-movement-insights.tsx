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

const percentFormatter = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
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

type DetailedTopTransaction = AnalysisSnapshot["topTransactions"][number] & {
  conceptOriginal?: string | null;
  balanceAfterCents?: number | null;
  reviewState?: string | null;
  duplicateState?: string | null;
  hasManualOverride?: boolean;
};

function formatMoney(cents: number) {
  return moneyFormatter.format(cents / 100);
}

function formatPercent(ratio: number) {
  return `${percentFormatter.format(ratio * 100)} %`;
}

function formatDate(value: string) {
  return shortDateFormatter.format(new Date(`${value}T12:00:00Z`)).replace(".", "");
}

function comparableConcept(value: string) {
  return value.trim().toLocaleLowerCase("es-ES").replace(/\s+/g, " ");
}

function truncateLabel(value: string, max = 18) {
  const clean = value.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function axisScale(maxValue: number) {
  const rawMaximum = Math.max(1, maxValue);
  const roughStep = rawMaximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = Math.max(1, Math.round(multiplier * magnitude));
  const maximum = Math.max(step, Math.ceil(rawMaximum / step) * step);
  return {
    maximum,
    step,
    ticks: Array.from({ length: Math.floor(maximum / step) + 1 }, (_, index) => index * step),
  };
}

function integerTicks(maximum: number) {
  const safeMaximum = Math.max(1, Math.round(maximum));
  if (safeMaximum <= 5) return Array.from({ length: safeMaximum + 1 }, (_, index) => index);
  const values = new Set<number>([0, safeMaximum]);
  for (let index = 1; index < 4; index += 1) values.add(Math.round((safeMaximum * index) / 4));
  return [...values].sort((left, right) => left - right);
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
    const height = 236;
    const left = 62;
    const right = 16;
    const top = 24;
    const bottom = 38;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const scale = axisScale(Math.max(...rows.map((row) => row.expenseCents)));
    const step = rows.length > 1 ? innerWidth / (rows.length - 1) : innerWidth;
    const points = rows.map((row, index) => ({
      x: rows.length > 1 ? left + step * index : left + innerWidth / 2,
      y: top + (1 - row.expenseCents / scale.maximum) * innerHeight,
      row,
    }));
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    return { width, height, left, right, top, bottom, maximum: scale.maximum, ticks: scale.ticks, points, path };
  }, [rows]);

  if (!chart) return <p className={styles.empty}>No hay gasto diario disponible en este periodo.</p>;

  return (
    <div className={styles.chartCard}>
      <div className={styles.cardHeading}>
        <div><span>RITMO DIARIO</span><strong>Cuándo se está concentrando el gasto</strong></div>
        <small>{rows.reduce((sum, row) => sum + row.rows, 0).toLocaleString("es-ES")} movimientos</small>
      </div>
      <div className={styles.svgViewport}>
        <svg className={styles.dailyChart} viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Evolución diaria del gasto del periodo con escala en euros">
          {chart.ticks.map((value) => {
            const y = chart.top + (1 - value / chart.maximum) * (chart.height - chart.top - chart.bottom);
            return (
              <g key={value} className={styles.gridLine}>
                <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} />
                <text x={chart.left - 10} y={y + 4} textAnchor="end">{formatMoney(value)}</text>
              </g>
            );
          })}
          <path className={styles.dailyArea} d={`${chart.path} L ${chart.points.at(-1)?.x} ${chart.height - chart.bottom} L ${chart.points[0].x} ${chart.height - chart.bottom} Z`} />
          <path className={styles.dailyLine} d={chart.path} />
          {chart.points.map(({ x, y, row }, index) => (
            <g key={row.date}>
              <circle className={styles.dailyPoint} cx={x} cy={y} r="4"><title>{`${formatDate(row.date)} · ${formatMoney(row.expenseCents)} · ${row.rows} movimientos`}</title></circle>
              {(rows.length <= 8 || index % Math.max(1, Math.ceil(rows.length / 6)) === 0) && (
                <text className={styles.valueLabel} x={x} y={Math.max(chart.top + 10, y - 10)} textAnchor="middle">{formatMoney(row.expenseCents)}</text>
              )}
              {(index === 0 || index === chart.points.length - 1 || index % Math.max(1, Math.ceil(chart.points.length / 6)) === 0) && (
                <text className={styles.axisLabel} x={x} y={chart.height - 10} textAnchor="middle">{formatDate(row.date)}</text>
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
    const cell = 25;
    const gap = 5;
    const left = 30;
    const top = 12;
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
        dayOfMonth: date.getUTCDate(),
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
      width: Math.max(210, left + weeks * (cell + gap) + 10),
      height: top + 7 * (cell + gap) + 8,
      activeDays: days.filter((day) => day.expenseCents > 0).length,
    };
  }, [snapshot.dailySpend, snapshot.selection.dateFrom, snapshot.selection.dateTo]);

  return (
    <div className={styles.chartCard}>
      <div className={styles.cardHeading}>
        <div><span>MAPA DE CALOR</span><strong>Qué días concentran más intensidad de gasto</strong></div>
        <small>{chart.activeDays.toLocaleString("es-ES")} días con gasto</small>
      </div>
      <div className={styles.heatmapViewport}>
        <svg className={styles.heatmapChart} viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Mapa de calor diario del gasto con número de día visible">
          {WEEKDAYS.map((label, index) => (
            <text key={label} className={styles.axisLabel} x={8} y={chart.top + index * (chart.cell + chart.gap) + chart.cell / 2 + 4}>{label}</text>
          ))}
          {chart.days.map((day) => {
            const intensity = day.expenseCents > 0 ? 0.24 + 0.76 * (day.expenseCents / chart.maximum) : 0.07;
            const x = chart.left + day.week * (chart.cell + chart.gap);
            const y = chart.top + day.weekday * (chart.cell + chart.gap);
            return (
              <g key={day.key}>
                <rect
                  className={styles.heatmapCell}
                  x={x}
                  y={y}
                  width={chart.cell}
                  height={chart.cell}
                  rx="5"
                  style={{ opacity: intensity }}
                >
                  <title>{`${formatDate(day.key)} · ${formatMoney(day.expenseCents)} · ${day.rows} movimientos`}</title>
                </rect>
                <text className={styles.heatmapDayLabel} x={x + chart.cell / 2} y={y + chart.cell / 2 + 4} textAnchor="middle">{day.dayOfMonth}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className={styles.heatmapLegend} aria-hidden="true">
        <span>Menor gasto</span>
        {[0.18, 0.42, 0.7, 1].map((opacity) => <i key={opacity} style={{ opacity }} />)}
        <span>Mayor gasto</span>
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
      <div className={styles.weekdayChart} role="img" aria-label="Gasto por día de la semana con importe y número de movimientos">
        {rows.map((row) => (
          <div key={row.weekday} className={styles.weekdayColumn} title={`${row.label}: ${formatMoney(row.expenseCents)} · ${row.rows} movimientos · media ${formatMoney(row.averageCents)}`}>
            <div><i style={{ height: `${Math.max(row.expenseCents > 0 ? 5 : 0, (row.expenseCents / maximum) * 100)}%` }} /></div>
            <strong>{row.label}</strong>
            <small>{row.rows.toLocaleString("es-ES")} mov.</small>
            <em>{formatMoney(row.expenseCents)}</em>
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

  const width = 620;
  const height = 300;
  const left = 76;
  const right = 24;
  const top = 26;
  const bottom = 48;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const maxRows = Math.max(1, ...rows.map((row) => row.rows));
  const xMaximum = Math.max(2, maxRows);
  const yScale = axisScale(Math.max(...rows.map((row) => row.averageCents ?? 0)));
  const xTicks = integerTicks(xMaximum);

  return (
    <div className={styles.chartCard}>
      <div className={styles.cardHeading}>
        <div><span>FRECUENCIA × IMPORTE</span><strong>Comercios frecuentes frente a compras grandes</strong></div>
        <small>{rows.length.toLocaleString("es-ES")} comercios</small>
      </div>
      <div className={styles.svgViewport}>
        <svg className={styles.scatterChart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Relación entre frecuencia de compra e importe medio por comercio con ejes numéricos">
          {yScale.ticks.map((value) => {
            const y = top + (1 - value / yScale.maximum) * innerHeight;
            return (
              <g key={`y-${value}`} className={styles.gridLine}>
                <line x1={left} x2={width - right} y1={y} y2={y} />
                <text x={left - 10} y={y + 4} textAnchor="end">{formatMoney(value)}</text>
              </g>
            );
          })}
          {xTicks.map((value) => {
            const x = left + (value / xMaximum) * innerWidth;
            return (
              <g key={`x-${value}`} className={styles.gridLine}>
                <line x1={x} x2={x} y1={top} y2={height - bottom} />
                <text x={x} y={height - bottom + 20} textAnchor="middle">{value}</text>
              </g>
            );
          })}
          <line className={styles.scatterAxis} x1={left} x2={left} y1={top} y2={height - bottom} />
          <line className={styles.scatterAxis} x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} />
          <text className={styles.axisTitle} x={width / 2} y={height - 8} textAnchor="middle">Número de compras</text>
          <text className={styles.axisTitle} x={left} y={14}>Importe medio por compra</text>
          {rows.map((row, index) => {
            const x = left + (row.rows / xMaximum) * innerWidth;
            const y = top + (1 - (row.averageCents ?? 0) / yScale.maximum) * innerHeight;
            const radius = 5 + Math.min(7, ((row.shareBps ?? 0) / 10000) * 18);
            return (
              <g key={`${row.id ?? "none"}-${row.name}`}>
                <circle className={styles.scatterPoint} cx={x} cy={y} r={radius}>
                  <title>{`${row.name} · ${row.rows} movimientos · media ${formatMoney(row.averageCents ?? 0)} · total ${formatMoney(row.expenseCents)}`}</title>
                </circle>
                {(rows.length <= 8 || index < 5) && (
                  <text className={styles.pointLabel} x={x + radius + 5} y={Math.max(top + 10, y - 5)}>{truncateLabel(row.name)}</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function MerchantConcentrationCurve({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const rows = snapshot.merchantDrivers.filter((row) => row.expenseCents > 0).slice(0, 30);
  const chart = useMemo(() => {
    if (rows.length === 0 || snapshot.current.expenseCents <= 0) return null;
    const width = 620;
    const height = 300;
    const left = 62;
    const right = 24;
    const top = 24;
    const bottom = 48;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    let cumulative = 0;
    const points = rows.map((row, index) => {
      cumulative += row.expenseCents;
      const ratio = Math.min(1, cumulative / snapshot.current.expenseCents);
      return {
        row,
        ratio,
        count: index + 1,
        x: left + ((index + 1) / rows.length) * innerWidth,
        y: top + (1 - ratio) * innerHeight,
      };
    });
    const path = [`M ${left} ${height - bottom}`, ...points.map((point) => `L ${point.x} ${point.y}`)].join(" ");
    return { width, height, left, right, top, bottom, points, path, innerWidth, innerHeight };
  }, [rows, snapshot.current.expenseCents]);

  if (!chart) return <p className={styles.empty}>No hay comercios suficientes para calcular concentración.</p>;

  const yTicks = [0, 0.5, 0.8, 1];
  const xTicks = integerTicks(rows.length).filter((value) => value > 0);

  return (
    <div className={styles.chartCard}>
      <div className={styles.cardHeading}>
        <div><span>CONCENTRACIÓN</span><strong>Cuánto gasto acumulan los primeros comercios</strong></div>
        <small>{rows.length.toLocaleString("es-ES")} comercios</small>
      </div>
      <div className={styles.svgViewport}>
        <svg className={styles.scatterChart} viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Curva de concentración del gasto por comercio con escala porcentual">
          {yTicks.map((ratio) => {
            const y = chart.top + (1 - ratio) * chart.innerHeight;
            return (
              <g key={`y-${ratio}`} className={styles.gridLine}>
                <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} />
                <text x={chart.left - 10} y={y + 4} textAnchor="end">{formatPercent(ratio)}</text>
              </g>
            );
          })}
          {xTicks.map((count) => {
            const x = chart.left + (count / rows.length) * chart.innerWidth;
            return (
              <g key={`x-${count}`} className={styles.gridLine}>
                <line x1={x} x2={x} y1={chart.top} y2={chart.height - chart.bottom} />
                <text x={x} y={chart.height - chart.bottom + 20} textAnchor="middle">{count}</text>
              </g>
            );
          })}
          <line className={styles.scatterAxis} x1={chart.left} x2={chart.left} y1={chart.top} y2={chart.height - chart.bottom} />
          <line className={styles.scatterAxis} x1={chart.left} x2={chart.width - chart.right} y1={chart.height - chart.bottom} y2={chart.height - chart.bottom} />
          <text className={styles.axisTitle} x={chart.width / 2} y={chart.height - 8} textAnchor="middle">Número de comercios acumulados</text>
          <path className={styles.dailyLine} d={chart.path} />
          {chart.points.map((point, index) => (
            <g key={`${point.row.id ?? "none"}-${point.row.name}`}>
              <circle className={styles.dailyPoint} cx={point.x} cy={point.y} r={index < 5 ? 4 : 3}>
                <title>{`${point.count}. ${point.row.name} · acumulado ${formatPercent(point.ratio)} · ${formatMoney(point.row.expenseCents)}`}</title>
              </circle>
              {index < 4 && (
                <text className={styles.valueLabel} x={point.x} y={Math.max(chart.top + 10, point.y - 10)} textAnchor="middle">{formatPercent(point.ratio)}</text>
              )}
            </g>
          ))}
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
        <div><span>MOVIMIENTOS DE MAYOR IMPACTO</span><strong>Detalle procedente del movimiento original</strong></div>
        <small>Top {rows.length.toLocaleString("es-ES")}</small>
      </div>
      <div className={styles.transactionList}>
        {rows.map((baseRow) => {
          const row = baseRow as DetailedTopTransaction;
          const originalConcept = row.conceptOriginal?.trim() ?? "";
          const showOriginalConcept = originalConcept.length > 0
            && comparableConcept(originalConcept) !== comparableConcept(row.conceptNormalized);
          const hasBalance = typeof row.balanceAfterCents === "number" && Number.isFinite(row.balanceAfterCents);
          const requiresReview = row.reviewState === "needs_review";
          const suspectedDuplicate = row.duplicateState === "suspected";

          return (
            <Link key={row.transactionId} href={transactionHref(snapshot, row)} className={styles.transactionRow}>
              <div className={styles.transactionMain}>
                <strong>{row.conceptNormalized}</strong>
                <span>{formatDate(row.bankDate)} · {row.merchantName} · {row.categoryName}</span>
                <small>{row.accountName}</small>
                {showOriginalConcept && <small>Concepto bancario: {originalConcept}</small>}
                {hasBalance && <small>Saldo tras movimiento: {formatMoney(row.balanceAfterCents as number)}</small>}
                {row.hasManualOverride && <small>Ajuste manual aplicado</small>}
                {requiresReview && <small>Requiere revisión</small>}
                {suspectedDuplicate && <small>Posible duplicado</small>}
              </div>
              <b>{formatMoney(row.amountCents)}</b>
            </Link>
          );
        })}
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

      <div className={styles.chartColumns}>
        <div className={styles.chartColumn}>
          <SpendingCalendar snapshot={snapshot} />
          <MerchantScatter snapshot={snapshot} />
        </div>
        <div className={styles.chartColumn}>
          <AmountBandsChart snapshot={snapshot} />
          <MerchantConcentrationCurve snapshot={snapshot} />
        </div>
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
