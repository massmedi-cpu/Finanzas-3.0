import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Lexical safety scanner for production TS/JS. TypeScript 7.0 does not expose
 * the old parser API. Full syntax and type checking stays in npm run typecheck.
 * This deliberately limited check is NOT a substitute for a full ESLint suite.
 */
export function lintSource(source, name = "fixture.ts") {
  const executable = source.split("");
  const commentsRemoved = source.split("");
  const commentText = Array.from(source, () => " ");
  const blank = (target, i) => { if (source[i] !== "\n" && source[i] !== "\r") target[i] = " "; };
  let mode = "code";
  let quote = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (mode === "code") {
      if (ch === "/" && next === "/") {
        mode = "line-comment";
        blank(executable, i); blank(executable, ++i);
        blank(commentsRemoved, i - 1); blank(commentsRemoved, i);
        commentText[i - 1] = "/"; commentText[i] = "/";
        continue;
      }
      if (ch === "/" && next === "*") {
        mode = "block-comment";
        blank(executable, i); blank(executable, ++i);
        blank(commentsRemoved, i - 1); blank(commentsRemoved, i);
        commentText[i - 1] = "/"; commentText[i] = "*";
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "\x60") {
        quote = ch; mode = "string"; blank(executable, i);
      }
    } else if (mode === "string") {
      blank(executable, i);
      if (ch === "\\" && i + 1 < source.length) { blank(executable, ++i); continue; }
      if (ch === quote) mode = "code";
    } else if (mode === "line-comment") {
      if (ch === "\n") { mode = "code"; continue; }
      blank(executable, i); blank(commentsRemoved, i); commentText[i] = ch;
    } else if (mode === "block-comment") {
      blank(executable, i); blank(commentsRemoved, i); commentText[i] = ch;
      if (ch === "*" && next === "/") {
        ++i; blank(executable, i); blank(commentsRemoved, i);
        commentText[i] = "/"; mode = "code";
      }
    }
  }
  const code = executable.join("");
  const withoutComments = commentsRemoved.join("");
  const comments = commentText.join("");
  const issues = [];
  function report(rule, index) {
    const before = source.slice(0, index);
    const line = before.split("\n").length;
    issues.push({ rule, line, column: index - before.lastIndexOf("\n") });
  }
  const rules = [
    ["debugger_statement", /\bdebugger\s*;/g],
    ["development_console", /\bconsole\s*(?:\.\s*(?:log|debug)|\[\s*(['"])(?:log|debug)\1\s*\])\s*\(/g],
    ["dynamic_code_execution", /\b(?:eval|Function)\s*\(/g],
  ];
  for (const [rule, expression] of rules) {
    for (const match of withoutComments.matchAll(expression)) {
      if (code[match.index] !== " ") report(rule, match.index);
    }
  }
  for (const match of comments.matchAll(/@ts-(?:ignore|nocheck)\b/g)) {
    report("unsound_ts_suppression", match.index);
  }
  return issues.sort((a, b) => a.line - b.line || a.column - b.column);
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
