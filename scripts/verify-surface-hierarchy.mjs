import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => {
  console.error(`❌ ART-005 surface hierarchy: ${message}`);
  process.exitCode = 1;
};
const pass = (message) => console.log(`✅ ${message}`);

function rule(css, selector, file) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) {
    fail(`${file}: falta la regla ${selector}`);
    return "";
  }
  return match[1];
}

function requireTokens(body, tokens, label) {
  for (const token of tokens) {
    if (!body.includes(token)) fail(`${label}: falta «${token}»`);
  }
}

function forbidTokens(body, tokens, label) {
  for (const token of tokens) {
    if (body.includes(token)) fail(`${label}: no debe contener «${token}»`);
  }
}

const homeFile = "app/inicio-overview.module.css";
const txFile = "app/transactions/transactions.module.css";
const configFile = "app/globals.css";
const docFile = "docs/precommercial-audit/07f-surface-hierarchy-10.0.58.md";

const home = read(homeFile);
const tx = read(txFile);
const config = read(configFile);

const attention = rule(home, ".attentionItem", homeFile);
requireTokens(attention, ["border-radius: 0", "background: transparent", "border-left: 2px"], "Inicio / attentionItem");
forbidTokens(attention, ["border: 1px"], "Inicio / attentionItem");

const txSummary = rule(tx, ".summary > div", txFile);
requireTokens(txSummary, ["border-radius: 0", "background: transparent", "border-left: 1px", "backdrop-filter: none"], "Movimientos / summary");
forbidTokens(txSummary, ["border: 1px"], "Movimientos / summary");

const trace = rule(tx, ".trace dl", txFile);
requireTokens(trace, ["border-radius: 0", "background: transparent", "border-left: 2px"], "Movimientos / trazabilidad");
forbidTokens(trace, ["border: 1px"], "Movimientos / trazabilidad");

const editor = rule(tx, ".editor, .reviewPanel", txFile);
requireTokens(editor, ["border-radius: 0", "background: transparent", "border-top: 1px"], "Movimientos / editor y revisión");
forbidTokens(editor, ["border: 1px", "linear-gradient"], "Movimientos / editor y revisión");

const reviewCard = rule(tx, ".reviewCard", txFile);
requireTokens(reviewCard, ["border-radius: 0", "background: transparent", "border-top: 1px"], "Movimientos / reviewCard");
forbidTokens(reviewCard, ["border: 1px"], "Movimientos / reviewCard");

const mobileRow = rule(tx, ".table tbody tr:not(.editorRow):not(.reviewRow)", txFile);
requireTokens(mobileRow, ["border-radius: 0", "background: transparent", "border-bottom: 1px"], "Movimientos / fila móvil");
forbidTokens(mobileRow, ["border: 1px"], "Movimientos / fila móvil");

const configSummary = rule(config, ".configuration-summary > div", configFile);
requireTokens(configSummary, ["border-radius: 0", "background: transparent", "border-left: 1px"], "Configuración / summary");
forbidTokens(configSummary, ["border: 1px"], "Configuración / summary");

const entityList = rule(config, ".entity-list", configFile);
requireTokens(entityList, ["gap: 0"], "Configuración / entity-list");

const entityCard = rule(config, ".entity-card", configFile);
requireTokens(entityCard, ["border-radius: 0", "background: transparent", "border-top: 1px"], "Configuración / entity-card");
forbidTokens(entityCard, ["border: 1px", "translateY"], "Configuración / entity-card");

if (!fs.existsSync(path.join(root, docFile))) fail(`falta ${docFile}`);

if (!process.exitCode) {
  pass("Inicio conserva panel estructural y aplana las alertas internas");
  pass("Movimientos aplana KPIs, trazabilidad, edición, revisión y filas móviles");
  pass("Configuración aplana KPIs y entidades dentro de paneles estructurales");
  pass("ART-005 protegido contra regresiones de cajas dentro de cajas");
}
