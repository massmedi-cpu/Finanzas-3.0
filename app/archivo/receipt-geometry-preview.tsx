import { buildReceiptVisualModel, type ReceiptVisualLayoutInput } from "@/lib/document/receipt-visual-model";

type VisualLine = {
  text: string;
  score: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

type VisualLayout = ReceiptVisualLayoutInput & {
  version: number;
  engine: string;
  model: string;
  language: string;
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
  const visual = buildReceiptVisualModel(layout);

  return <div style={{ display: "grid", gap: 12, width: "100%" }}>
    <svg
      style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
      viewBox={`0 0 ${visual.width} ${visual.height}`}
      role="img"
      aria-label="Reconstrucción espacial del ticket"
      preserveAspectRatio="xMinYMin meet"
    >
      <rect x="0" y="0" width={visual.width} height={visual.height} fill="#fffdf6" />
      {visual.rules.map((y, index) => <line
        key={`rule-${index}`}
        x1={visual.width * 0.015}
        x2={visual.width * 0.985}
        y1={y}
        y2={y}
        stroke="#6d695d"
        strokeWidth={Math.max(0.45, visual.medianHeight * 0.045)}
        opacity="0.72"
      />)}
      {visual.tokens.map((token) => <text
        key={`${token.top}-${token.left}-${token.index}-${token.text}`}
        x={token.renderX}
        y={token.baselineY}
        fill="#171717"
        fontFamily={'"Roboto", "Arial Narrow", Arial, Helvetica, sans-serif'}
        fontSize={token.fontSize}
        fontWeight={token.fontWeight}
        textAnchor={token.textAnchor}
        dominantBaseline="alphabetic"
        letterSpacing={token.letterSpacing}
        textLength={token.textLength}
        lengthAdjust="spacingAndGlyphs"
      >
        <title>{`Confianza OCR ${Math.round(token.score)}%`}</title>
        {token.text}
      </text>)}
    </svg>
    <small style={{ color: "#655f51", fontSize: 10, lineHeight: 1.45 }}>Filas, columnas, tamaños y centrado reconstruidos desde las coordenadas reales; el original privado sigue siendo la referencia.</small>
  </div>;
}
