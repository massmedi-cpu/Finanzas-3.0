import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const write = (path, content) => {
  const slash = path.lastIndexOf("/");
  if (slash > 0) mkdirSync(path.slice(0, slash), { recursive: true });
  writeFileSync(path, content);
};

function replaceOnce(path, before, after) {
  const source = read(path);
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`PRE-032 pattern missing in ${path}: ${before.slice(0, 120)}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`PRE-032 pattern is not unique in ${path}: ${before.slice(0, 120)}`);
  write(path, source.slice(0, first) + after + source.slice(first + before.length));
}

function replaceCount(path, before, after, expected) {
  const source = read(path);
  const count = source.split(before).length - 1;
  if (count !== expected) throw new Error(`PRE-032 expected ${expected} occurrences in ${path}, found ${count}: ${before}`);
  write(path, source.split(before).join(after));
}

const categoryIdentityComponent = `"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { categoryColorHex } from "../src/domain/category-visuals";
import { CategoryGlyph } from "../src/ui/category-glyph";
import styles from "./category-identity.module.css";

type CategoryVisual = {
  id: string;
  name: string;
  iconKey: string;
  colorToken: string;
};

type CategoryIdentityState = {
  byId: ReadonlyMap<string, CategoryVisual> | null;
};

const CategoryIdentityContext = createContext<CategoryIdentityState>({ byId: null });

function normalizeCategory(value: unknown): CategoryVisual | null {
  if (!value || typeof value !== "object") return null;
  const category = value as Record<string, unknown>;
  if (
    typeof category.id !== "string"
    || typeof category.name !== "string"
    || typeof category.iconKey !== "string"
    || typeof category.colorToken !== "string"
  ) return null;
  return {
    id: category.id,
    name: category.name,
    iconKey: category.iconKey,
    colorToken: category.colorToken,
  };
}

export function CategoryIdentityProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [categories, setCategories] = useState<CategoryVisual[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCategories(null);
    void fetch("/api/category-identity", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("category_identity_unavailable");
        const payload = await response.json().catch(() => ({}));
        if (!Array.isArray(payload?.categories)) throw new Error("category_identity_invalid");
        return payload.categories.map(normalizeCategory).filter(Boolean) as CategoryVisual[];
      })
      .then((next) => {
        if (!cancelled) setCategories(next);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => { cancelled = true; };
  }, [pathname]);

  const byId = useMemo(() => {
    if (categories === null) return null;
    return new Map(categories.map((category) => [category.id, category]));
  }, [categories]);

  return <CategoryIdentityContext.Provider value={{ byId }}>{children}</CategoryIdentityContext.Provider>;
}

export function CategoryIdentity({
  categoryId,
  name,
  fallback = "Sin categoría",
  iconOnly = false,
}: {
  categoryId: string | null | undefined;
  name?: string | null;
  fallback?: string;
  iconOnly?: boolean;
}) {
  const { byId } = useContext(CategoryIdentityContext);
  const visual = categoryId && byId ? byId.get(categoryId) ?? null : null;
  const label = name?.trim() || visual?.name || fallback;

  if (!categoryId || !visual) {
    if (iconOnly) return <span className={styles.iconPlaceholder} aria-hidden="true" />;
    return <span className={styles.labelOnly}>{label}</span>;
  }

  const style = { "--category-color": categoryColorHex(visual.colorToken) } as CSSProperties;
  if (iconOnly) {
    return (
      <span
        className={styles.iconOnly}
        style={style}
        aria-hidden="true"
        data-category-id={categoryId}
        data-category-icon={visual.iconKey}
        data-category-color-token={visual.colorToken}
      >
        <CategoryGlyph name={visual.iconKey} size={17} />
      </span>
    );
  }

  return (
    <span
      className={styles.identity}
      style={style}
      data-category-id={categoryId}
      data-category-icon={visual.iconKey}
      data-category-color-token={visual.colorToken}
    >
      <span className={styles.icon} aria-hidden="true"><CategoryGlyph name={visual.iconKey} size={15} /></span>
      <span className={styles.label}>{label}</span>
    </span>
  );
}
`;

const categoryIdentityCss = `.identity,
.labelOnly {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

.identity {
  gap: .38rem;
}

.label,
.labelOnly {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon,
.iconOnly,
.iconPlaceholder {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  border-radius: .48rem;
}

.icon,
.iconOnly {
  color: var(--category-color);
  background: color-mix(in srgb, var(--category-color) 15%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--category-color) 28%, transparent);
}

.icon {
  width: 1.45rem;
  height: 1.45rem;
}

.iconOnly,
.iconPlaceholder {
  width: 1.8rem;
  height: 1.8rem;
}

.iconPlaceholder {
  background: rgba(255,255,255,.045);
  box-shadow: inset 0 0 0 1px var(--color-border);
}

@media (prefers-reduced-motion: reduce) {
  .identity,
  .icon,
  .iconOnly { transition: none !important; }
}
`;

const categoryIdentityRoute = `import { createEdgeConfigurationService } from "../../../src/infrastructure/persistence/edge-configuration-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories = await createEdgeConfigurationService().listCategories();
    return Response.json(
      { categories },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch (error) {
    console.error("category-identity-api", error instanceof Error ? error.message : String(error));
    return Response.json(
      { error: "category_identity_unavailable" },
      { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }
}
`;

write("app/category-identity.tsx", categoryIdentityComponent);
write("app/category-identity.module.css", categoryIdentityCss);
write("app/api/category-identity/route.ts", categoryIdentityRoute);

replaceOnce(
  "app/layout.tsx",
  'import { ActionFeedbackProvider } from "./action-feedback";\n',
  'import { ActionFeedbackProvider } from "./action-feedback";\nimport { CategoryIdentityProvider } from "./category-identity";\n',
);
replaceOnce(
  "app/layout.tsx",
  '        <ActionFeedbackProvider><PwaRuntimeProvider>{children}</PwaRuntimeProvider></ActionFeedbackProvider>',
  '        <ActionFeedbackProvider><PwaRuntimeProvider><CategoryIdentityProvider>{children}</CategoryIdentityProvider></PwaRuntimeProvider></ActionFeedbackProvider>',
);

replaceOnce(
  "app/transactions/transactions-client.tsx",
  'import { DraftRecoveryNotice } from "../draft-recovery-notice";\n',
  'import { DraftRecoveryNotice } from "../draft-recovery-notice";\nimport { CategoryIdentity } from "../category-identity";\n',
);
replaceOnce(
  "app/transactions/transactions-client.tsx",
  '<td data-label="Categoría">{row.category.effectiveName ?? <span className={styles.muted}>Sin categoría</span>}</td>',
  '<td data-label="Categoría"><CategoryIdentity categoryId={row.category.effectiveId} name={row.category.effectiveName} /></td>',
);

replaceOnce(
  "app/budgets/budgets-client.tsx",
  'import { useActionFeedback } from "../action-feedback";\n',
  'import { useActionFeedback } from "../action-feedback";\nimport { CategoryIdentity } from "../category-identity";\n',
);
replaceOnce(
  "app/budgets/budgets-client.tsx",
  '<span className={styles.cardIcon}><Icon name={total ? "wallet" : "category"} /></span>',
  '<span className={styles.cardIcon}>{total ? <Icon name="wallet" /> : <CategoryIdentity categoryId={item.categoryId} name={item.categoryName} iconOnly />}</span>',
);

replaceOnce(
  "app/analysis/analysis-client.tsx",
  'import { FinancialTrendChart } from "../../src/design/financial-trend-chart";\n',
  'import { FinancialTrendChart } from "../../src/design/financial-trend-chart";\nimport { CategoryIdentity } from "../category-identity";\n',
);
replaceOnce(
  "app/analysis/analysis-client.tsx",
  '<strong>{item.name}</strong>\n                <span>\n                  {formatInteger(item.rows)} mov.',
  '<strong>{merchant ? item.name : <CategoryIdentity categoryId={item.id} name={item.name} />}</strong>\n                <span>\n                  {formatInteger(item.rows)} mov.',
);
replaceOnce(
  "app/analysis/analysis-client.tsx",
  '<strong>{strongest.name}</strong>\n          <small className={strongest.deltaCents > 0 ? styles.badDelta : styles.goodDelta}>',
  '<strong><CategoryIdentity categoryId={strongest.id} name={strongest.name} /></strong>\n          <small className={strongest.deltaCents > 0 ? styles.badDelta : styles.goodDelta}>',
);
replaceOnce(
  "app/analysis/analysis-client.tsx",
  '<ContributionChart rows={snapshot.changeDrivers} formatMoney={formatMoney} />',
  '<ContributionChart rows={snapshot.changeDrivers} formatMoney={formatMoney} renderLabel={(row) => <CategoryIdentity categoryId={row.id} name={row.name} />} />',
);
replaceOnce(
  "app/analysis/analysis-client.tsx",
  '<strong>{item.name}</strong>\n                        <span>{formatMoney(item.expenseCents)} · {formatPercentBps(item.shareBps)}</span>',
  '<strong><CategoryIdentity categoryId={item.id} name={item.name} /></strong>\n                        <span>{formatMoney(item.expenseCents)} · {formatPercentBps(item.shareBps)}</span>',
);
replaceOnce(
  "app/analysis/analysis-client.tsx",
  '<span>{formatDate(item.bankDate)} · {item.categoryName}</span>',
  '<span>{formatDate(item.bankDate)} · <CategoryIdentity categoryId={item.categoryId} name={item.categoryName} /></span>',
);
replaceOnce(
  "app/analysis/analysis-client.tsx",
  '<span>{item.categoryName ?? "Categoría"}</span>\n                          <strong>{formatMoney(Math.abs(item.remainingCents))} por encima</strong>',
  '<span><CategoryIdentity categoryId={item.categoryId} name={item.categoryName} fallback="Categoría" /></span>\n                          <strong>{formatMoney(Math.abs(item.remainingCents))} por encima</strong>',
);

replaceOnce(
  "app/analysis/analysis-movement-insights.tsx",
  'import { formatMoneyCents as formatMoney } from "../../src/core/money";\n',
  'import { formatMoneyCents as formatMoney } from "../../src/core/money";\nimport { CategoryIdentity } from "../category-identity";\n',
);
replaceOnce(
  "app/analysis/analysis-movement-insights.tsx",
  '<span>{formatDate(row.bankDate)} · {row.merchantName} · {row.categoryName}</span>',
  '<span>{formatDate(row.bankDate)} · {row.merchantName} · <CategoryIdentity categoryId={row.categoryId} name={row.categoryName} /></span>',
);

replaceOnce(
  "src/design/contribution-chart.tsx",
  'import { useMemo, useState } from "react";',
  'import { useMemo, useState, type ReactNode } from "react";',
);
replaceOnce(
  "src/design/contribution-chart.tsx",
  '  limit?: number;\n};',
  '  limit?: number;\n  renderLabel?: (row: ContributionPoint) => ReactNode;\n};',
);
replaceOnce(
  "src/design/contribution-chart.tsx",
  'export function ContributionChart({ rows, formatMoney, limit = 6 }: Props) {',
  'export function ContributionChart({ rows, formatMoney, limit = 6, renderLabel }: Props) {',
);
replaceOnce(
  "src/design/contribution-chart.tsx",
  '<strong>{row.name}</strong>\n                <span>{row.deltaCents === 0 ? "Sin cambio"',
  '<strong>{renderLabel ? renderLabel(row) : row.name}</strong>\n                <span>{row.deltaCents === 0 ? "Sin cambio"',
);

replaceOnce(
  "app/forecast/forecast-client.tsx",
  'import { DraftRecoveryNotice } from "../draft-recovery-notice";\n',
  'import { DraftRecoveryNotice } from "../draft-recovery-notice";\nimport { CategoryIdentity } from "../category-identity";\n',
);
replaceOnce(
  "app/forecast/forecast-client.tsx",
  '{item.categoryName ? <span>{item.categoryName}</span> : null}',
  '{item.categoryId ? <CategoryIdentity categoryId={item.categoryId} name={item.categoryName} /> : null}',
);

replaceOnce(
  "app/forecast/forecast-calendar.tsx",
  'import { formatMoneyCents } from "../../src/core/money";\n',
  'import { formatMoneyCents } from "../../src/core/money";\nimport { CategoryIdentity } from "../category-identity";\n',
);
replaceOnce(
  "app/forecast/forecast-calendar.tsx",
  '<div><strong>{item.concept}</strong><span>{statusText(item)}</span></div>',
  '<div><strong>{item.concept}</strong><span>{statusText(item)}</span>{item.categoryId ? <CategoryIdentity categoryId={item.categoryId} name={item.categoryName} /> : null}</div>',
);

replaceOnce(
  "app/documents/documents-client.tsx",
  'import { DraftRecoveryNotice } from "../draft-recovery-notice";\n',
  'import { DraftRecoveryNotice } from "../draft-recovery-notice";\nimport { CategoryIdentity } from "../category-identity";\n',
);
replaceOnce(
  "app/documents/documents-client.tsx",
  '  category: { effectiveName: string | null };',
  '  category: { effectiveId: string | null; effectiveName: string | null };',
);
replaceOnce(
  "app/documents/documents-client.tsx",
  '<p>{formatDate(association.date)} · {association.accountName} · {formatMoneyCents(association.amountCents)}</p><small>',
  '<p>{formatDate(association.date)} · {association.accountName} · {formatMoneyCents(association.amountCents)}</p>{association.categoryId ? <CategoryIdentity categoryId={association.categoryId} name={null} /> : null}<small>',
);
replaceOnce(
  "app/documents/documents-client.tsx",
  '<p>{formatDate(candidate.date)} · {candidate.accountName}</p><small>{formatMoneyCents(candidate.amountCents)}',
  '<p>{formatDate(candidate.date)} · {candidate.accountName}</p>{candidate.categoryId ? <CategoryIdentity categoryId={candidate.categoryId} name={null} /> : null}<small>{formatMoneyCents(candidate.amountCents)}',
);
replaceOnce(
  "app/documents/documents-client.tsx",
  '<p>{formatDate(transaction.bankDate)} · {transaction.account.name}</p><small>{formatMoneyCents(transaction.amountCents)}',
  '<p>{formatDate(transaction.bankDate)} · {transaction.account.name}</p>{transaction.category.effectiveId ? <CategoryIdentity categoryId={transaction.category.effectiveId} name={transaction.category.effectiveName} /> : null}<small>{formatMoneyCents(transaction.amountCents)}',
);

replaceOnce(
  "app/inicio-overview.tsx",
  'import HomeSmartBrief from "./home-smart-brief";\n',
  'import HomeSmartBrief from "./home-smart-brief";\nimport { CategoryIdentity } from "./category-identity";\n',
);
replaceOnce(
  "app/inicio-overview.tsx",
  '  amountCents: number;\n  status: "planned" | "excluded" | "confirmed";',
  '  amountCents: number;\n  categoryId: string | null;\n  categoryName: string | null;\n  status: "planned" | "excluded" | "confirmed";',
);
replaceOnce(
  "app/inicio-overview.tsx",
  '  category: { effectiveName: string | null };',
  '  category: { effectiveId: string | null; effectiveName: string | null };',
);
replaceOnce(
  "app/inicio-overview.tsx",
  '<div><strong>{item.concept}</strong><span>{formatDate(item.date)}</span></div>',
  '<div><strong>{item.concept}</strong><span>{formatDate(item.date)}{item.categoryId ? <> · <CategoryIdentity categoryId={item.categoryId} name={item.categoryName} /></> : null}</span></div>',
);
replaceOnce(
  "app/inicio-overview.tsx",
  '<span>{item.categoryName}</span><b>{displayMoney(item.actualExpenseCents)}</b>',
  '<span><CategoryIdentity categoryId={item.categoryId} name={item.categoryName} fallback="Categoría" /></span><b>{displayMoney(item.actualExpenseCents)}</b>',
);
replaceOnce(
  "app/inicio-overview.tsx",
  '<span>{row.category.effectiveName ?? kindLabel(row.kind.effective)} · {row.account.name}</span>',
  '<span><CategoryIdentity categoryId={row.category.effectiveId} name={row.category.effectiveName} fallback={kindLabel(row.kind.effective)} /> · {row.account.name}</span>',
);

replaceOnce("package.json", '"version": "10.0.49"', '"version": "10.0.50"');
replaceCount("package-lock.json", '"version": "10.0.49"', '"version": "10.0.50"', 2);

const auditScript = `import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(\`../\${path}\`, import.meta.url), "utf8");
const failures = [];
let passes = 0;
function check(clause, description, condition) {
  if (condition) { passes += 1; console.log(\`PASS \${clause} · \${description}\`); }
  else failures.push(\`FAIL \${clause} · \${description}\`);
}
function hasAll(text, values) { return values.every((value) => text.includes(value)); }

const globals = read("app/globals.css");
const categoryVisuals = read("src/domain/category-visuals.ts");
const categoryGlyph = read("src/ui/category-glyph.tsx");
const categoryIdentity = read("app/category-identity.tsx");
const shell = read("app/app-shell.tsx");
const feedback = read("app/action-feedback.tsx");
const contribution = read("src/design/contribution-chart.tsx");
const trend = read("src/design/financial-trend-chart.tsx");
const forecastChart = read("src/design/forecast-balance-chart.tsx");
const surfaces = [
  "app/inicio-overview.tsx",
  "app/transactions/transactions-client.tsx",
  "app/budgets/budgets-client.tsx",
  "app/analysis/analysis-client.tsx",
  "app/forecast/forecast-client.tsx",
  "app/documents/documents-client.tsx",
  "src/design/contribution-chart.tsx",
].map((path) => [path, read(path)]);

check("§62", "dirección visual oscura y superficies coherentes", hasAll(globals, ["color-scheme: dark", "--color-bg:", "--color-surface:", "--radius-panel:"]));
check("§63", "sistema semántico de color central", hasAll(globals, ["--color-primary:", "--color-success:", "--color-warning:", "--color-danger:"]));
check("§64", "catálogo único de color e icono de categoría", categoryVisuals.includes("CATEGORY_ICON_OPTIONS") && categoryVisuals.includes("CATEGORY_COLOR_OPTIONS") && categoryGlyph.includes("data-category-icon"));
check("§64", "identidad visual resuelta desde Configuración sin inventar valores", categoryIdentity.includes('/api/category-identity') && categoryIdentity.includes("categoryColorHex") && categoryIdentity.includes("data-category-color-token"));
for (const [path, source] of surfaces) check("§64", \`identidad de categoría propagada: \${path}\`, source.includes("CategoryIdentity") || path.includes("contribution-chart"));
check("§65", "iconografía vectorial coherente", categoryGlyph.includes("<svg") && read("src/design/product-icons.tsx").includes("export function ProductIcon"));
check("§66", "tarjetas y paneles usan sistema estable de radios/superficies", hasAll(globals, ["--radius-md:", "--radius-lg:", "--radius-panel:", "--shadow-panel:"]));
check("§67", "gráficos principales mantienen contratos accesibles", [contribution, trend, forecastChart].every((source) => source.includes("aria-label") || source.includes('role="img"')));
check("§68", "jerarquía visual con títulos y contenido principal accesible", shell.includes('href="#main-content"') && shell.includes('id="main-content"') && globals.includes("--font-page-title:"));
check("§69", "sistema tipográfico único centralizado", hasAll(globals, ["--font-page-title:", "--font-section-title:", "--font-kpi-primary:", "--font-body:", "--font-label:", "--font-helper:"]));
check("§70", "legibilidad base no reducida para resolver espacio", /--font-body:\\s*1rem/.test(globals) && /--font-helper:\\s*0\\.8125rem/.test(globals));
check("§71", "feedback y navegación conservan patrones globales estables", feedback.includes("pending") && feedback.includes("success") && feedback.includes("error") && shell.includes('aria-label="Navegación principal"'));

console.log(\`Axioma §§62–71 · evidencia objetiva: \${passes} PASS, \${failures.length} FAIL\`);
if (failures.length) { failures.forEach((failure) => console.error(failure)); process.exit(1); }
console.log("PASS · El gate no sustituye juicio humano sobre calma visual, densidad, belleza, pertinencia contextual o facilidad de escaneado.");
`;
write("scripts/audit-axioma-62-71.mjs", auditScript);

const auditDoc = `# PRE-031 corregida + PRE-032 · Axioma §§62–71 · 01/10/2026

## Corrección de trazabilidad

La primera versión de PRE-031 protegía invariantes útiles, pero atribuía incorrectamente parte de ellas a la numeración §§62–71. Esta revisión corrige la correspondencia contra el **Prompt Maestro Axioma Definitivo** real:

- §62 Dirección visual.
- §63 Color.
- §64 Categorías = color + icono.
- §65 Iconografía.
- §66 Tarjetas.
- §67 Gráficos.
- §68 Jerarquía visual.
- §69 Sistema tipográfico único.
- §70 Legibilidad: no solucionar espacio haciendo la letra pequeña.
- §71 Regla de estabilidad visual.

La corrección no borra el historial de PR #444: lo enmienda de forma explícita y verificable.

## Gap funcional real encontrado

§64 exige que cada categoría conserve exactamente su color e icono en Inicio, Movimientos, Presupuestos, Análisis, Previsión, Documentos y gráficos. Financial App ya persistía 'iconKey' y 'colorToken' y permitía editarlos en Configuración, pero los demás módulos reducían la categoría a nombre/id o usaban iconos genéricos.

PRE-032 / Financial App 10.0.50 introduce un proveedor visual común de solo lectura que obtiene la identidad desde Configuración y la representa de forma consistente en las siete superficies. No cambia cálculos, datos bancarios, reglas de categorización ni persistencia financiera.

## Estrategia

- Fuente única: categorías persistidas ya existentes.
- Endpoint de lectura dedicado: '/api/category-identity'.
- Sin colores inventados: si la identidad no está disponible, se conserva el texto sin mostrar un icono/color incorrecto.
- Refresco al cambiar de ruta para no arrastrar una identidad antigua después de editar Configuración.
- Los gráficos conservan el color semántico de variación/estado; la identidad de categoría se expresa en su etiqueta mediante el color/icono de la categoría, evitando confundir semántica financiera con branding categorial.
- Guardrails intactos: 'bankSource=read_only', 'financialWrites=false', 'requiresHumanReview=true'.

## Evidencia automática

'scripts/audit-axioma-62-71.mjs' queda corregido con la numeración real y añade el contrato transversal del §64. La certificación automática no pretende decidir cuestiones subjetivas como calma visual, densidad ideal o belleza; esas siguen requiriendo inspección humana.
`;
write("docs/audits/axioma-62-71-20261001.md", auditDoc);

console.log("PRE-032 patch applied: category identity propagated and Axioma §§62–71 mapping corrected.");
