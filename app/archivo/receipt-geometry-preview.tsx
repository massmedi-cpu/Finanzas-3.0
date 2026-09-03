import { buildReceiptVisualModel, type ReceiptVisualLayoutInput } from "@/lib/document/receipt-visual-model";
import { receiptPhysicalPreviewLayout } from "@/lib/document/receipt-visual-physical-layout";
import { buildReceiptVisualRules } from "@/lib/document/receipt-visual-rules";
import { receiptTextLength } from "@/lib/document/receipt-text-fit";

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
  sourceWidth?: number;
  sourceHeight?: number;
  bounds: ReceiptVisualLayoutInput["bounds"] & {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
  };
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
  const physicalLayout = receiptPhysicalPreviewLayout(layout);
  const visual = buildReceiptVisualModel(physicalLayout);
  const rules = buildReceiptVisualRules(physicalLayout);

  return <div style={{ display: "grid", gap: 12, width: "100%" }}>
    <svg
      style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
      viewBox={`0 0 ${visual.width} ${visual.height}`}
      role="img"
      aria-label="Reconstrucción espacial del ticket"
      preserveAspectRatio="xMinYMin meet"
    >
      <rect x="0" y="0" width={visual.width} height={visual.height} fill="#fffdf6" />
      {rules.map((rule, index) => <line
        key={`rule-${index}-${rule.x1}-${rule.y}`}
        x1={rule.x1}
        x2={rule.x2}
        y1={rule.y}
        y2={rule.y}
        stroke="#6d695d"
        strokeWidth={rule.strokeWidth}
        strokeDasharray={rule.pattern === "dotted"
          ? `${rule.strokeWidth} ${rule.strokeWidth * 2.4}`
          : rule.pattern === "dashed"
            ? `${rule.strokeWidth * 4} ${rule.strokeWidth * 2.5}`
            : undefined}
        strokeLinecap={rule.pattern === "dotted" ? "round" : "butt"}
        opacity="0.72"
      />)}
      {visual.tokens.map((token) => {
        const textLength = receiptTextLength({
          text: token.text,
          boxWidth: token.boxWidth,
          fontSize: token.fontSize,
          explicitTextLength: token.textLength,
        });
        // Las filas centradas conservan el centro físico medido. El modelo puede
        // clasificarlas como centradas para anclaje tipográfico, pero no debe
        // desplazarlas artificialmente al centro perfecto si el papel no lo hizo.
        const renderX = token.textAnchor === "middle" ? token.centerX : token.renderX;
        return <text
          key={`${token.top}-${token.left}-${token.index}-${token.text}`}
          x={renderX}
          y={token.baselineY}
          fill="#171717"
          fontFamily={'"Roboto", "Arial Narrow", Arial, Helvetica, sans-serif'}
          fontSize={token.fontSize}
          fontWeight={token.fontWeight}
          textAnchor={token.textAnchor}
          dominantBaseline="alphabetic"
          letterSpacing={token.letterSpacing}
          textLength={textLength}
          lengthAdjust="spacingAndGlyphs"
        >
          <title>{`Confianza OCR ${Math.round(token.score)}%`}</title>
          {token.text}
        </text>;
      })}
    </svg>
    <small style={{ color: "#655f51", fontSize: 10, lineHeight: 1.45 }}>Filas, columnas, separadores, márgenes, tamaños, ancho y posición reconstruidos desde las coordenadas reales; el original privado sigue siendo la referencia.</small>
  </div>;
}