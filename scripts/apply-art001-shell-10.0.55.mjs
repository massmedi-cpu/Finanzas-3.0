import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.cwd(), "app/app-shell.module.css");
let css = readFileSync(path, "utf8");

const replacements = [
  ["background: linear-gradient(180deg, rgba(5, 9, 20, 0.96) 0%, rgba(5, 9, 20, 0.84) 72%, rgba(5, 9, 20, 0) 100%);", "background: var(--gradient-navigation-frame);"],
  ["background: linear-gradient(135deg, rgba(31, 107, 255, 0.28), rgba(43, 217, 247, 0.09));", "background: var(--gradient-primary-active);"],
  ["background: linear-gradient(135deg, rgba(31, 107, 255, 0.34), rgba(43, 217, 247, 0.14));", "background: var(--gradient-primary-pending);"],
  ["background: linear-gradient(135deg, rgba(31, 107, 255, 0.2), rgba(43, 217, 247, 0.08));", "background: var(--gradient-primary-install);"],
  ["background: linear-gradient(135deg, rgba(31, 107, 255, 0.22), rgba(43, 217, 247, 0.07));", "background: var(--gradient-primary-mobile);"],
  ["background: linear-gradient(90deg, transparent, var(--color-primary-bright), rgba(43, 217, 247, 0.9), transparent);", "background: var(--gradient-progress);"],
  ["box-shadow: 0 14px 38px rgba(0, 0, 0, 0.24);", "box-shadow: var(--shadow-navigation);"],
  ["box-shadow: 0 -8px 34px rgba(0, 0, 0, 0.34);", "box-shadow: var(--shadow-mobile-dock);"],
  ["box-shadow: 0 -12px 42px rgba(0, 0, 0, 0.4);", "box-shadow: var(--shadow-mobile-panel);"],
  ["box-shadow: inset 0 0 0 1px rgba(77, 141, 255, 0.08);", "box-shadow: var(--shadow-primary-inset);"],
  ["rgba(10, 17, 34, 0.98)", "var(--surface-navigation-strong)"],
  ["rgba(10, 17, 34, 0.9)", "var(--surface-navigation)"],
  ["rgba(7, 13, 27, 0.96)", "var(--surface-mobile-dock)"],
  ["rgba(7, 13, 27, 0.985)", "var(--surface-mobile-panel)"],
  ["rgba(9, 17, 35, 0.96)", "var(--surface-control-strong)"],
  ["rgba(255, 255, 255, 0.04)", "var(--surface-interactive-soft)"],
  ["rgba(255, 255, 255, 0.025)", "var(--surface-card)"],
  ["rgba(255, 255, 255, 0.018)", "var(--surface-interactive-muted)"],
  ["rgba(31, 107, 255, 0.16)", "var(--surface-primary-soft)"],
  ["rgba(77, 141, 255, 0.12)", "var(--surface-primary-progress)"],
  ["rgba(77, 141, 255, 0.08)", "var(--surface-primary-subtle)"],
  ["rgba(137, 173, 255, 0.2)", "var(--border-navigation)"],
  ["rgba(137, 173, 255, 0.16)", "var(--border-navigation-soft)"],
  ["rgba(137, 173, 255, 0.1)", "var(--border-navigation-subtle)"],
  ["rgba(137, 173, 255, 0.38)", "var(--border-navigation-scrollbar)"],
  ["rgba(77, 141, 255, 0.48)", "var(--border-primary-strong)"],
  ["rgba(77, 141, 255, 0.38)", "var(--border-primary-soft)"],
  ["rgba(77, 141, 255, 0.32)", "var(--border-primary-mobile)"],
  ["rgba(43, 217, 247, 0.5)", "var(--border-accent-strong)"],
  ["rgba(43, 217, 247, 0.28)", "var(--border-accent-soft)"],
  ["#ffffff", "var(--text-on-strong)"],
  ["border-radius: 0.85rem;", "border-radius: var(--radius-item);"],
  ["border-radius: 0.8rem;", "border-radius: var(--radius-navigation-link);"],
  ["border-radius: 1.15rem;", "border-radius: var(--radius-mobile-dock);"],
  ["border-radius: 1rem;", "border-radius: var(--radius-mobile-panel);"],
  ["border-radius: 0.7rem;", "border-radius: var(--radius-control);"],
  ["border-radius: 0.65rem;", "border-radius: var(--radius-control-compact);"],
  ["border-radius: 0.78rem;", "border-radius: var(--radius-mobile-item);"],
];

for (const [from, to] of replacements) {
  if (!css.includes(from)) {
    throw new Error(`ART-001 migration precondition missing: ${from}`);
  }
  css = css.split(from).join(to);
}

const rawColors = [...css.matchAll(/#[0-9a-f]{3,8}\b|rgba?\s*\(/gi)].map((match) => match[0]);
if (rawColors.length > 0) {
  throw new Error(`Raw shell colors remain after ART-001 migration: ${rawColors.join(", ")}`);
}

for (const token of [
  "--surface-navigation",
  "--gradient-navigation-frame",
  "--border-navigation",
  "--shadow-navigation",
  "--surface-mobile-dock",
  "--shadow-mobile-dock",
  "--text-on-strong",
]) {
  if (!css.includes(`var(${token})`)) {
    throw new Error(`Expected migrated token missing from app shell: ${token}`);
  }
}

writeFileSync(path, css);
console.log("ART-001 app shell migration: OK");
