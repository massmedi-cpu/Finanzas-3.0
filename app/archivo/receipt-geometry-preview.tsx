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
  const shellStyle: CSSProperties = { display: "grid", gap: 12, width: "100%" };
  const canvasStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio: `${layout.bounds.width} / ${layout.bounds.height}`,
    containerType: "inline-size",
    overflow: "hidden",
  };
  const noteStyle: CSSProperties = { color: "#655f51", fontSize: 10, lineHeight: 1.45 };
  return <div style={shellStyle}>
    <div style={canvasStyle} aria-label="Reconstrucción espacial del ticket">
      {layout.lines.map((line, index) => {
        const fontCqw = Math.max(1.05, Math.min(4.8, (line.height / aspect) * 0.72));
        const style = {
          position: "absolute",
          left: `${line.left}%`,
          top: `${line.top}%`,
          maxWidth: `${Math.max(line.width + 8, 18)}%`,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: `clamp(8px, ${fontCqw}cqw, 17px)`,
          lineHeight: 1.05,
          whiteSpace: "nowrap",
          color: "#171717",
          transformOrigin: "left top",
        } as CSSProperties;
        return <span style={style} key={`${line.top}-${line.left}-${index}`} title={`Confianza OCR ${Math.round(line.score)}%`}>{line.text}</span>;
      })}
    </div>
    <small style={noteStyle}>Maquetación reconstruida desde la posición real de cada línea detectada; el original privado sigue siendo la referencia.</small>
  </div>;
}
