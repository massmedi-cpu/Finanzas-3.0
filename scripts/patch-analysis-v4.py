from pathlib import Path
import re

client = Path("app/analysis/analysis-client.tsx")
text = client.read_text()

quick_read = '''function QuickRead({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const strongest = snapshot.changeDrivers[0] ?? null;
  const forecast = snapshot.forecast;
  const anomalyCount = snapshot.anomalies.length;
  const anomalyLabel = anomalyCount === 1 ? "movimiento a revisar" : "movimientos a revisar";

  return (
    <section className={styles.quickRead} aria-label="Lectura rápida">
      <div className={styles.quickReadIntro}>
        <span>LECTURA RÁPIDA</span>
        <strong>Lo importante del periodo</strong>
      </div>
      {strongest ? (
        <Link className={styles.quickReadItem} href={strongest.href ?? periodHref(snapshot)}>
          <span>Mayor cambio</span>
          <strong>{strongest.name}</strong>
          <small className={strongest.deltaCents > 0 ? styles.badDelta : styles.goodDelta}>{deltaText(strongest.deltaCents)}</small>
        </Link>
      ) : (
        <div className={styles.quickReadItem}>
          <span>Mayor cambio</span>
          <strong>Sin variaciones</strong>
          <small>frente al periodo comparable</small>
        </div>
      )}
      <Link className={styles.quickReadItem} href="#anomalies-heading">
        <span>Anomalías</span>
        <strong>{anomalyCount.toLocaleString("es-ES")}</strong>
        <small>{anomalyLabel}</small>
      </Link>
      <Link className={styles.quickReadItem} href="/forecast">
        <span>Previsión neta</span>
        <strong>{forecast ? formatMoney(forecast.summary.projectedNetCents) : "—"}</strong>
        <small>{forecast ? `hasta ${formatDate(forecast.period.dateTo)}` : "fuera del periodo"}</small>
      </Link>
      <Link className={styles.quickReadItem} href="#comercios-heading">
        <span>Concentración comercial</span>
        <strong>{formatPercentBps(snapshot.concentration.top3MerchantBps)}</strong>
        <small>del gasto en 3 comercios</small>
      </Link>
    </section>
  );
}

'''
marker = "function LoadingSkeleton() {"
if "function QuickRead(" not in text:
    if text.count(marker) != 1:
        raise SystemExit("QuickRead insertion anchor changed")
    text = text.replace(marker, quick_read + marker, 1)

state_line = "  const [categoriesExpanded, setCategoriesExpanded] = useState(false);\n"
if text.count(state_line) != 1:
    raise SystemExit("categoriesExpanded state anchor changed")
text = text.replace(state_line, "", 1)

text = text.replace(
    "                <span>Ingresos, gastos y ahorro sobre una escala común; selecciona cualquier mes para ver el origen.</span>\n",
    "",
    1,
)
text = text.replace(
    "                <span>Comparación equivalente con {comparisonLabel(snapshot)}. Las barras muestran qué categorías explican el cambio.</span>\n",
    "                <span>vs. {comparisonLabel(snapshot)}</span>\n",
    1,
)

trend_anchor = '          <section className={`${styles.section} ${styles.trendSection}`} aria-labelledby="evolution-heading">'
if text.count(trend_anchor) != 1:
    raise SystemExit("trend insertion anchor changed")
text = text.replace(trend_anchor, "          <QuickRead snapshot={snapshot} />\n\n" + trend_anchor, 1)

concentration = '''            <section className={styles.section} aria-labelledby="concentration-heading">
              <div className={styles.sectionHeading}>
                <div>
                  <p>CONCENTRACIÓN</p>
                  <h2 id="concentration-heading">Cuánto depende tu gasto de pocos grupos</h2>
                </div>
              </div>
              <div className={styles.concentrationGrid}>
                <div>
                  <span>3 categorías principales</span>
                  <strong>{formatPercentBps(snapshot.concentration.top3CategoryBps)}</strong>
                  <p>del gasto del periodo</p>
                </div>
                <div>
                  <span>3 comercios principales</span>
                  <strong>{formatPercentBps(snapshot.concentration.top3MerchantBps)}</strong>
                  <p>del gasto del periodo</p>
                </div>
              </div>
            </section>
'''
if text.count(concentration) != 1:
    raise SystemExit("concentration block anchor changed")
text = text.replace(concentration, "", 1)

ranking_old = '''          <section className={styles.rankingsSection} aria-labelledby="rankings-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p>DETALLE</p>
                <h2 id="rankings-heading">Principales categorías y comercios</h2>
                <span>Rankings secundarios para investigar el origen del gasto, sin duplicar la lectura principal.</span>
              </div>
            </div>
            <div className={styles.rankingsGrid}>
              <DriverRanking title="Categorías" items={snapshot.categoryDrivers} expanded={categoriesExpanded} onToggle={() => setCategoriesExpanded((value) => !value)} />
              <DriverRanking title="Comercios" items={snapshot.merchantDrivers} merchant expanded={merchantsExpanded} onToggle={() => setMerchantsExpanded((value) => !value)} />
            </div>
          </section>'''
ranking_new = '''          <section className={styles.rankingsSection} aria-labelledby="rankings-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p>DETALLE</p>
                <h2 id="rankings-heading">Comercios principales</h2>
              </div>
              <span>{formatPercentBps(snapshot.concentration.top3MerchantBps)} en los 3 primeros</span>
            </div>
            <div className={styles.rankingsGrid}>
              <DriverRanking title="Comercios" items={snapshot.merchantDrivers} merchant expanded={merchantsExpanded} onToggle={() => setMerchantsExpanded((value) => !value)} />
            </div>
          </section>'''
if text.count(ranking_old) != 1:
    raise SystemExit("ranking block anchor changed")
text = text.replace(ranking_old, ranking_new, 1)

text = text.replace(
    "El estado global está actualizado. El detalle por categorías se consulta en Presupuestos para no ralentizar Análisis.",
    "Detalle por categorías disponible en Presupuestos.",
    1,
)
client.write_text(text)

css = Path("app/analysis/analysis.module.css")
styles = css.read_text()

quick_css = '''.quickRead {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(10.5rem, 0.72fr) repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-top: var(--space-4);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-border);
}

.quickReadIntro,
.quickReadItem {
  min-width: 0;
  padding: 0.85rem 0.95rem;
  background: linear-gradient(145deg, rgba(14, 25, 48, 0.76), rgba(7, 14, 29, 0.7));
}

.quickReadIntro {
  display: grid;
  align-content: center;
  gap: 0.18rem;
}

.quickReadIntro span,
.quickReadItem > span {
  color: var(--color-text-muted);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.quickReadIntro strong {
  font-size: 0.82rem;
  line-height: 1.25;
}

.quickReadItem {
  display: grid;
  align-content: center;
  gap: 0.22rem;
  color: inherit;
  text-decoration: none;
  transition: background 160ms ease;
}

.quickReadItem:hover {
  background: linear-gradient(145deg, rgba(24, 43, 78, 0.82), rgba(8, 17, 34, 0.76));
}

.quickReadItem:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--color-primary-bright);
  outline-offset: -2px;
}

.quickReadItem strong {
  overflow-wrap: anywhere;
  font-size: 0.96rem;
  line-height: 1.18;
  font-variant-numeric: tabular-nums;
}

.quickReadItem small {
  color: var(--color-text-muted);
  font-size: 0.67rem;
  line-height: 1.25;
}

'''
css_marker = ".section,\n.rankingsSection {"
if ".quickRead {" not in styles:
    if styles.count(css_marker) != 1:
        raise SystemExit("quickRead css anchor changed")
    styles = styles.replace(css_marker, quick_css + css_marker, 1)

styles = styles.replace(
    ".intelligenceGrid { grid-template-columns: minmax(0, 1.15fr) minmax(18rem, 0.85fr); }",
    ".intelligenceGrid { grid-template-columns: 1fr; }",
    1,
)
styles = styles.replace(
    ".rankingsGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }",
    ".rankingsGrid { grid-template-columns: 1fr; }",
    1,
)
styles = styles.replace(",\n.concentrationGrid p", "", 1)
styles, removed = re.subn(
    r"\n\.concentrationGrid \{.*?\n\.contextCard \{",
    "\n.contextCard {",
    styles,
    count=1,
    flags=re.S,
)
if removed != 1:
    raise SystemExit("concentration css block anchor changed")
styles = styles.replace("  .concentrationGrid { grid-template-columns: 1fr 1fr; }\n", "", 1)
styles = styles.replace("  .concentrationGrid { grid-template-columns: 1fr; }\n", "", 1)

for marker, rules in [
    ("@media (max-width: 72rem) {", "\n  .quickRead { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n  .quickReadIntro { grid-column: 1 / -1; }"),
    ("@media (max-width: 26.875rem) {", "\n  .quickRead { grid-template-columns: 1fr 1fr; }\n  .quickReadIntro { grid-column: 1 / -1; }"),
    ("@media (max-width: 22.5rem) {", "\n  .quickRead { grid-template-columns: 1fr; }\n  .quickReadIntro { grid-column: auto; }"),
]:
    if styles.count(marker) != 1:
        raise SystemExit(f"media anchor changed: {marker}")
    styles = styles.replace(marker, marker + rules, 1)

css.write_text(styles)

spec = Path("tests/e2e/analysis.spec.ts")
tests = spec.read_text()
old_link = '  await expect(page.getByRole("link", { name: "Ver movimientos de Alimentación" })).toHaveAttribute("href", new RegExp(`categoryId=${CATEGORY_FOOD}`));'
new_link = '  await expect(page.getByRole("link", { name: /Alimentación/ }).first()).toHaveAttribute("href", new RegExp(`categoryId=${CATEGORY_FOOD}`));'
if tests.count(old_link) != 1:
    raise SystemExit("analysis spec category link anchor changed")
tests = tests.replace(old_link, new_link, 1)
indicator_line = '  await expect(page.getByLabel("Indicadores principales del periodo")).toContainText(/550,00/);'
if tests.count(indicator_line) != 1:
    raise SystemExit("analysis spec indicator anchor changed")
tests = tests.replace(
    indicator_line,
    indicator_line + '\n  await expect(page.getByLabel("Lectura rápida")).toBeVisible();\n  await expect(page.getByRole("heading", { name: "Comercios principales" })).toBeVisible();',
    1,
)
spec.write_text(tests)

visual = Path("tests/e2e/premium-analysis-visual.spec.ts")
vtests = visual.read_text()
visual_anchor = '    await expect(page.getByLabel("Indicadores principales del periodo")).toBeVisible();'
if vtests.count(visual_anchor) != 1:
    raise SystemExit("premium visual anchor changed")
vtests = vtests.replace(
    visual_anchor,
    visual_anchor + '\n    await expect(page.getByLabel("Lectura rápida")).toBeVisible();\n    await expect(page.getByRole("heading", { name: "Comercios principales" })).toBeVisible();',
    1,
)
visual.write_text(vtests)
