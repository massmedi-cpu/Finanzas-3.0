import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const contractPath = "src/design/product-icons.tsx";
const documentationPath = "docs/precommercial-audit/07e-iconography-system-10.0.57.md";
const contract = read(contractPath);
const documentation = read(documentationPath);

const requiredNames = ["search", "close", "more", "chevron-left", "chevron-right"];
for (const name of requiredNames) {
  assert(contract.includes(`| \"${name}\"`), `Falta ProductIconName canónico: ${name}.`);
  assert(documentation.includes(`\`${name}\``), `La documentación ART-004 debe declarar el icono canónico ${name}.`);
}

assert(contract.includes("PRODUCT_ICON_STROKE_WIDTH = 1.8"), "El stroke de producto debe permanecer centralizado en 1.8.");
assert(contract.includes('PRODUCT_ICON_DEFAULT_SIZE = "1em"'), "El tamaño por defecto debe permanecer centralizado en 1em.");
assert(contract.includes("data-product-icon={name}"), "ProductIcon debe exponer data-product-icon para inspección y pruebas.");
assert(contract.includes("decorative?: true"), "ProductIcon debe mantener la variante decorativa tipada.");
assert(contract.includes("decorative: false"), "ProductIcon debe mantener la variante accesible tipada.");
assert(contract.includes("label: string"), "Los iconos accesibles deben exigir label.");
assert(contract.includes('aria-hidden={decorative ? "true" : undefined}'), "La variante decorativa debe ocultarse del árbol accesible.");
assert(contract.includes('aria-label={decorative ? undefined : label}'), "La variante no decorativa debe exponer su label accesible.");
assert(contract.includes('role={decorative ? undefined : "img"}'), "La variante no decorativa debe usar role=img.");

const surfaces = new Map([
  ["app/app-shell.tsx", ["chevron-left", "chevron-right"]],
  ["app/mobile-navigation.tsx", ["close", "more"]],
  ["app/global-search.tsx", ["search"]],
  ["app/pwa-install-button.tsx", ["close"]],
]);

const legacyGlyphs = [
  ["×", "cierre ×"],
  ["•••", "más •••"],
  ["‹", "chevron ‹"],
  ["›", "chevron ›"],
];

for (const [path, icons] of surfaces) {
  const source = read(path);
  assert(source.includes("ProductIcon"), `${path} debe consumir ProductIcon.`);
  assert(!/<svg\b/i.test(source), `${path} contiene SVG inline; usa el catálogo ProductIcon para iconografía de interfaz.`);
  for (const icon of icons) {
    assert(source.includes(`name=\"${icon}\"`), `${path} debe usar el icono canónico ${icon}.`);
  }
  for (const [glyph, label] of legacyGlyphs) {
    assert(!source.includes(glyph), `${path} conserva el glifo legado ${label}.`);
  }
}

const globalSearch = read("app/global-search.tsx");
const searchUses = globalSearch.match(/name=\"search\"/g)?.length ?? 0;
assert(searchUses >= 2, "El buscador global debe reutilizar el mismo ProductIcon search en disparador y campo.");

const appShell = read("app/app-shell.tsx");
assert(appShell.includes('<ProductIcon name={item.icon} />'), "AppShell debe mantener los destinos de navegación ligados al catálogo semántico.");

const mobileNavigation = read("app/mobile-navigation.tsx");
assert(mobileNavigation.includes('<ProductIcon name={item.icon} />'), "La navegación móvil debe mantener los destinos ligados al mismo catálogo semántico.");

assert(documentation.includes("acciones/conceptos repetidos"), "La documentación ART-004 debe conservar el criterio de aceptación semántico.");
assert(documentation.includes("Sin escritura en Google Drive/Sheets"), "La documentación debe dejar explícito que ART-004 no escribe en la fuente financiera.");

if (failures.length) {
  console.error("Product icon system guard: FAILED");
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error("No dupliques SVG o glifos de interfaz: amplía ProductIcon sólo cuando exista una semántica reusable.");
  process.exit(1);
}

console.log("Product icon system guard: OK");
console.log(`- catálogo: ${contractPath}`);
console.log(`- superficies gobernadas: ${surfaces.size}`);
console.log(`- iconos de acción normalizados: ${requiredNames.join(", ")}`);
console.log(`- usos search verificados: ${searchUses}`);
console.log("- accesibilidad: decorativo por defecto; label obligatorio para iconos semánticos sin texto");
