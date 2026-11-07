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
  test("rejects " + rule + ": " + source.slice(0, 28), () => {
    assert.ok(lintSource(source).some(issue => issue.rule === rule));
  });
}
test("accepts ordinary TSX and allowed console.error", () => {
  assert.deepEqual(lintSource('export const Ex = () => <button onClick={() => console.error("error")}>OK</button>;', "app/Ex.tsx"), []);
});
test("ignores dangerous-looking text in strings and comments", () => {
  assert.deepEqual(lintSource('const text = "debugger; console.log(); eval(1)";\n// console.log(1)\n/* eval(3) */'), []);
});
test("reports positions but not confidential source text", () => {
  assert.deepEqual(lintSource("const ok = true;\nconsole.log('private');"), [{ rule: "development_console", line: 2, column: 1 }]);
  assert.ok(!JSON.stringify(lintSource("console.log('PRIVATE_SENTINEL');")).includes("PRIVATE_SENTINEL"));
});
test("detects bracket syntax outside strings", () => {
  assert.deepEqual(lintSource('const x = "console[\\\"log\\\"]()";'), []);
  assert.ok(lintSource('/*hi*/ console["log"](42)').some(issue => issue.rule === "development_console"));
});
