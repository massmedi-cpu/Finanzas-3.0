import { test } from "node:test";
import assert from "node:assert/strict";
import { lintSource } from "../../scripts/release-lint.mjs";

const forbidden = [
  ["debugger;", "debugger_statement"],
  ["console.log('x')", "development_console"],
  ["console.debug('x')", "development_console"],
  ["console['log']('x')", "development_console"],
  ["eval('1+1')", "dynamic_code_execution"],
  ["Function('return 1')", "dynamic_code_execution"],
  ["new Function('return 1')", "dynamic_code_execution"],
  ["// @ts-ignore\nlet value = 42;", "unsound_ts_suppression"],
  ["/* @ts-nocheck */\nlet value = 42;", "unsound_ts_suppression"],
];
for (const [source, rule] of forbidden) {
  test(`rejects ${rule}: ${source.slice(0, 32)}`, () => {
    assert.ok(lintSource(source).some(problem => problem.rule === rule));
  });
}
test("accepts ordinary TSX UI and deliberate error logging", () => {
  const source = 'export const Example = () => <button onClick={() => console.error("error")}>Listo</button>';
  assert.deepEqual(lintSource(source, "app/example.tsx"), []);
});
test("ignores strings rather than executing or falsely reporting them", () => {
  assert.deepEqual(lintSource('const text = "debugger; console.log(); eval(1)";'), []);
});
test("rejects invalid syntax", () => {
  assert.ok(lintSource("export const x = ;").some(p => p.rule === "syntax_error"));
});
test("returns location but never source text in a finding", () => {
  const results = lintSource("const ok = true;\nconsole.log('private sentinel');");
  assert.deepEqual(results, [{ rule: "development_console", line: 2, column: 1 }]);
  assert.ok(!JSON.stringify(results).includes("private sentinel"));
});
