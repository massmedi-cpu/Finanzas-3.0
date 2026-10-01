import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const failures = [];
const evidence = [];

function check(clause, description, condition, detail = "") {
  if (condition) {
    evidence.push({ clause, description, status: "PASS" });
  } else {
    failures.push({ clause, description, detail });
  }
}

function hasAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

const globals = read("app/globals.css");
const shell = read("app/app-shell.tsx");
const feedback = read("app/action-feedback.tsx");
const transactions = read("app/transactions/transactions-client.tsx");
const icons = read("src/design/product-icons.tsx");
const packageJson = JSON.parse(read("package.json"));

// §62 · Minimalismo financiero: sólo certificamos invariantes objetivas de sistema.
check("§62", "espaciado estructural tokenizado", hasAll(globals, ["--space-1:", "--space-4:", "--space-8:", "--content-max:"]));
check("§62", "jerarquía de superficies reutilizable", hasAll(globals, ["--color-surface:", "--color-border:", "--radius-panel:"]));

// §63 · Color semántico: estados básicos deben existir como tokens, no como decisiones aisladas.
check("§63", "tokens semánticos de estado", hasAll(globals, ["--color-primary:", "--color-success:", "--color-warning:", "--color-danger:"]));

// §64 · Tipografía: jerarquía definida y una única pila principal.
const fontTokens = [
  "--font-page-title:", "--font-section-title:", "--font-subtitle:", "--font-kpi-primary:",
  "--font-kpi-secondary:", "--font-body:", "--font-body-secondary:", "--font-label:",
  "--font-table:", "--font-button:", "--font-helper:",
];
check("§64", "jerarquía tipográfica centralizada", hasAll(globals, fontTokens));
check("§64", "escala principal relativa", /--font-page-title:\s*clamp\([^;]*rem/.test(globals) && /--font-body:\s*1rem/.test(globals));
check("§64", "pila tipográfica global única", /font-family:\s*Inter,\s*ui-sans-serif,\s*system-ui/.test(globals));

// §65 · Iconografía: familia interna única, semántica y sin dependencia de librerías externas.
const dependencyNames = Object.keys({ ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) });
const externalIconPackages = dependencyNames.filter((name) => /(lucide|heroicons|fontawesome|react-icons|material-icons|phosphor|tabler-icons)/i.test(name));
check("§65", "familia de iconos de producto única", icons.includes("export function ProductIcon") && icons.includes("ProductIconName"));
check("§65", "iconos decorativos ocultos a tecnología asistiva", icons.includes('aria-hidden="true"') && icons.includes('focusable="false"'));
check("§65", "sin segunda librería de iconos", externalIconPackages.length === 0, externalIconPackages.join(", "));

// §67 · Navegación: ubicación, salto a contenido y feedback de transición.
check("§67", "navegación principal nombrada", shell.includes('aria-label="Navegación principal"'));
check("§67", "sección activa expuesta", shell.includes('aria-current={active && !pendingHref ? "page" : undefined}'));
check("§67", "salto al contenido principal", shell.includes('href="#main-content"') && shell.includes('id="main-content"'));
check("§67", "estado de navegación pendiente", shell.includes("pendingHref") && shell.includes("navigationProgress"));

// §68 · Feedback visual y accesible para acciones asíncronas.
check("§68", "estados pending/success/error", hasAll(feedback, ['"pending"', '"success"', '"error"']));
check("§68", "región viva accesible", feedback.includes('role={item.state === "error" ? "alert" : "status"}') && feedback.includes("aria-live="));
check("§68", "feedback de carga en movimientos", transactions.includes('role="status">Leyendo movimientos persistidos…'));
check("§68", "errores de movimientos anunciados", transactions.includes('role="alert">{error}</div>'));

// §69 · Tablas/listados: cabeceras semánticas, lectura móvil y filtros claros.
check("§69", "listado financiero usa table/thead/th", hasAll(transactions, ["<table", "<thead>", "<th", "<tbody>"]));
check("§69", "celdas aportan etiqueta para adaptación móvil", transactions.includes('data-label="Cuenta"') && transactions.includes('data-label="Categoría"') && transactions.includes('data-label="Importe"'));
check("§69", "filtros del listado tienen nombre visible", transactions.includes('aria-label="Filtros de movimientos"') && transactions.includes("<label className={styles.searchField}>") && transactions.includes("<span>Cuenta</span>"));

// §70 · Formularios: labels, validación útil y preservación del origen.
check("§70", "controles editables asociados a labels visibles", transactions.includes("<label className={`${styles.editorField}") && transactions.includes("<span>Concepto</span>"));
check("§70", "validación accesible del concepto", transactions.includes('aria-invalid={conceptError ? "true" : "false"}') && transactions.includes("aria-describedby={conceptError ? CONCEPT_ERROR_ID : undefined}"));
check("§70", "errores de campo anunciados", transactions.includes('className={styles.fieldError} role="alert"'));
check("§70", "edición preserva explícitamente fuente bancaria", transactions.includes("El registro bancario original permanece intacto"));
check("§70", "estado de guardado visible", transactions.includes('{saving ? "Guardando…" : "Guardar cambios"}'));

// §71 · Jerarquía: títulos, resumen y orden información→detalle.
check("§71", "página de movimientos expone h1 y resumen antes del listado", transactions.indexOf("<h1>Movimientos</h1>") > -1 && transactions.indexOf("<h1>Movimientos</h1>") < transactions.indexOf('id="transaction-list-heading"'));
check("§71", "resumen superior con indicadores", transactions.includes('aria-label="Resumen del listado"') && transactions.includes("Filtros activos") && transactions.includes("Seleccionados"));

console.log(`Axioma §§62–71 · controles objetivos: ${evidence.length} PASS, ${failures.length} FAIL`);
for (const item of evidence) console.log(`PASS ${item.clause} · ${item.description}`);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL ${failure.clause} · ${failure.description}${failure.detail ? ` · ${failure.detail}` : ""}`);
  }
  process.exit(1);
}

console.log("PASS · El gate objetivo no sustituye la revisión humana de minimalismo, densidad, jerarquía estética ni pertinencia contextual del color.");
