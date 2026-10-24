import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

/**
 * Dependency-free release lint using the TypeScript compiler parser.
 * Focus: dangerous executable patterns, unsupported compiler suppressions
 * and syntax in production source. Type safety is enforced separately by
 * npm run typecheck; this is NOT a replacement for a full ESLint ruleset.
 */
export function lintSource(source, name = "fixture.ts") {
  const kind = name.endsWith(".tsx") ? ts.ScriptKind.TSX
    : name.endsWith(".jsx") ? ts.ScriptKind.JSX
    : /\.(?:mjs|cjs|js)$/.test(name) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, kind);
  const problems = [];
  const report = (node, rule) => {
    const at = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
    problems.push({ rule, line: at.line + 1, column: at.character + 1 });
  };
  for (const diagnostic of parsed.parseDiagnostics) {
    const at = parsed.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    problems.push({ rule: "syntax_error", line: at.line + 1, column: at.character + 1 });
  }
  // TypeScript directives must not silently suppress correctness checks.
  const directive = /(?:^|\n)\s*(?:\/\/|\/\*+|\*)\s*@ts-(?:ignore|nocheck)\b/g;
  for (const match of source.matchAll(directive)) {
    const pos = match.index + match[0].lastIndexOf("@ts-");
    const at = parsed.getLineAndCharacterOfPosition(pos);
    problems.push({ rule: "unsound_ts_suppression", line: at.line + 1, column: at.character + 1 });
  }
  function visit(node) {
    if (ts.isDebuggerStatement(node)) report(node, "debugger_statement");
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && (node.expression.text === "eval" || node.expression.text === "Function")) {
        report(node, "dynamic_code_execution");
      }
      const target = node.expression;
      if (ts.isPropertyAccessExpression(target)
        && ts.isIdentifier(target.expression) && target.expression.text === "console"
        && (target.name.text === "log" || target.name.text === "debug")) {
        report(node, "development_console");
      }
      if (ts.isElementAccessExpression(target)
        && ts.isIdentifier(target.expression) && target.expression.text === "console"
        && ts.isStringLiteral(target.argumentExpression)
        && ["log", "debug"].includes(target.argumentExpression.text)) {
        report(node, "development_console");
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Function") {
      report(node, "dynamic_code_execution");
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return problems;
}

function collect(root, prefix = "") {
  const result = [];
  for (const item of readdirSync(resolve(root, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) {
      if (!["node_modules", ".next", "dist", "coverage"].includes(item.name)) result.push(...collect(root, name));
    } else if (item.isFile() && /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(item.name) && !item.name.endsWith(".d.ts")) {
      result.push(name);
    }
  }
  return result;
}

export function runReleaseLint(root = process.cwd()) {
  const paths = ["app", "src"].flatMap(folder => collect(resolve(root, folder)).map(path => `${folder}/${path}`));
  paths.push("proxy.ts");
  paths.sort();
  const findings = [];
  for (const path of paths) {
    const source = readFileSync(resolve(root, path), "utf8");
    for (const diagnostic of lintSource(source, path)) findings.push({ file: path, ...diagnostic });
  }
  return { checked: paths.length, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runReleaseLint();
    if (result.findings.length) {
      console.error(JSON.stringify({ status: "failed", checked: result.checked, findings: result.findings }, null, 2));
      process.exitCode = 1;
    } else {
      console.info(JSON.stringify({ status: "ok", check: "release_static_lint", checked: result.checked, typecheckIndependent: true }));
    }
  } catch (error) {
    console.error("release_static_lint_unavailable", error instanceof Error ? error.name : typeof error);
    process.exitCode = 1;
  }
}
