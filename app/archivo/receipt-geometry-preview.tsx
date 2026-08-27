import type { CSSProperties } from "react";

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
  const aspect = Math.max(0.22, Math.min(3.2, layout.bounds.width / Math.max(1, layout.bounds.height)));
  return <div className="receipt-geometry-shell">
    <div className="receipt-geometry" style={{ aspectRatio: `${layout.bounds.width} / ${layout.bounds.height}` }}>
      {layout.lines.map((line, index) => {
        const fontCqw = Math.max(1.05, Math.min(4.8, (line.height / aspect) * 0.72));
        const style = {
          left: `${line.left}%`,
          top: `${line.top}%`,
          maxWidth: `${Math.max(line.width + 6, 16)}%`,
          "--receipt-font-cqw": fontCqw,
        } as CSSProperties & Record<string, number | string>;
        return <span className="receipt-geometry-line" style={style} key={`${line.top}-${line.left}-${index}`} title={`Confianza OCR ${Math.round(line.score)}%`}>{line.text}</span>;
      })}
    </div>
    <small className="receipt-geometry-note">Maquetación reconstruida desde la posición real de cada línea detectada; el original privado sigue siendo la referencia.</small>
  </div>;
}
