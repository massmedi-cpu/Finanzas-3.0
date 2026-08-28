type VisualLine = {
  text: string;
  score: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

type VisualLayout = {
  version: number;
  engine: string;
  model: string;
  language: string;
  bounds: { width: number; height: number };
  lines: VisualLine[];
};

function validNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

export function isReceiptVisualLayout(value: unknown): value is VisualLayout {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<VisualLayout>;
  return Boolean(
    layout.bounds &&
    validNumber(layout.bounds.width) &&
    validNumber(layout.bounds.height) &&
    Array.isArray(layout.lines) &&
    layout.lines.every((line) => line && typeof line.text === "string" && validNumber(line.left) && validNumber(line.top) && validNumber(line.width) && validNumber(line.height)),
  );
}

export function ReceiptGeometryPreview({ layout }: { layout: VisualLayout }) {
  const width = Math.max(1, layout.bounds.width);
  const height = Math.max(1, layout.bounds.height);
  const nativeLines = layout.lines.map((line) => ({
    ...line,
    x: line.left / 100 * width,
    y: line.top / 100 * height,
    boxWidth: Math.max(0.5, line.width / 100 * width),
    boxHeight: Math.max(0.5, line.height / 100 * height),
  }));
  const orderedHeights = nativeLines.map((line) => line.boxHeight).sort((a, b) => a - b);
  const medianHeight = orderedHeights[Math.floor(orderedHeights.length / 2)] || 1;
  const rowTolerance = medianHeight * 0.62;
  const rows: Array<{ top: number; bottom: number; text: string }> = [];
  for (const line of [...nativeLines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const centerY = line.y + line.boxHeight / 2;
    const row = rows.find((candidate) => Math.abs(centerY - (candidate.top + candidate.bottom) / 2) <= rowTolerance);
    if (row) {
      row.top = Math.min(row.top, line.y);
      row.bottom = Math.max(row.bottom, line.y + line.boxHeight);
      row.text += ` ${line.text}`;
    } else rows.push({ top: line.y, bottom: line.y + line.boxHeight, text: line.text });
  }
  const rules = rows.flatMap((row) => {
    const key = row.text.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const rowHeight = Math.max(1, row.bottom - row.top);
    if (key.includes("DESCRIP") && (key.includes("PRECIO") || key.includes("IMPORTE"))) {
      return [row.top - rowHeight * 0.38, row.bottom + rowHeight * 0.42];
    }
    if (/\bBASE\b/.test(key)) return [row.top - rowHeight * 0.42];
    if (/\b(PENDIENTE|PAGADO)\b/.test(key)) {
      return [
        row.top - rowHeight * 0.46,
        row.top - rowHeight * 0.31,
        row.bottom + rowHeight * 0.31,
        row.bottom + rowHeight * 0.46,
      ];
    }
    return [];
  }).filter((value) => value > 0 && value < height);

  return <div style={{ display: "grid", gap: 12, width: "100%" }}>
    <svg
      style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Reconstrucción espacial del ticket"
      preserveAspectRatio="xMinYMin meet"
    >
      <rect x="0" y="0" width={width} height={height} fill="#fffdf6" />
      {rules.map((y, index) => <line key={`rule-${index}`} x1={width * 0.015} x2={width * 0.985} y1={y} y2={y} stroke="#6d695d" strokeWidth={Math.max(0.45, medianHeight * 0.045)} strokeDasharray={`${Math.max(1.2, medianHeight * 0.17)} ${Math.max(0.8, medianHeight * 0.1)}`} opacity="0.78" />)}
      {nativeLines.map((line, index) => {
        const key = line.text.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const emphasized = line.boxHeight >= medianHeight * 1.28 || /^(TOTAL|PENDIENTE|PAGADO)|DESCRIP|IMPORTE/.test(key);
        return <text
          key={`${line.top}-${line.left}-${index}`}
          x={line.x}
          y={line.y + line.boxHeight * 0.08}
          fill="#171717"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          fontSize={Math.max(1, line.boxHeight * 0.9)}
          fontWeight={emphasized ? 720 : 500}
          dominantBaseline="hanging"
          textLength={line.boxWidth}
          lengthAdjust="spacingAndGlyphs"
        >
          <title>{`Confianza OCR ${Math.round(line.score)}%`}</title>
          {line.text}
        </text>;
      })}
    </svg>
    <small style={{ color: "#655f51", fontSize: 10, lineHeight: 1.45 }}>Filas, columnas, tamaños y centrado reconstruidos desde las coordenadas reales; el original privado sigue siendo la referencia.</small>
  </div>;
}
