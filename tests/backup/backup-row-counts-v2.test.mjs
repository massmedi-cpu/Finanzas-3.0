import assert from "node:assert/strict";
import { test } from "node:test";
import { copyRowCounts, verifyRowCounts } from "../../scripts/verify-backup-row-counts-v2.mjs";

const dump = [
  "-- PostgreSQL database dump",
  "COPY financial_app.transaction_overrides (id, note) FROM stdin;",
  "1\tprimera línea\\nsegunda línea\\tcon tabulación",
  "2\t\\\\.",
  "\\.",
  'COPY "financial_app"."documents" (id) FROM stdin;',
  "\\.",
  "COPY financial_app.audit_changes (note) FROM stdin;",
  "COPY no es una cabecera dentro de los datos",
  "",
  "\\.",
  "",
].join("\n");

test("cuenta todas las tablas COPY, incluidas vacías y filas con caracteres escapados", () => {
  assert.deepEqual([...copyRowCounts(dump)], [
    ["financial_app.transaction_overrides", 2],
    ["financial_app.documents", 0],
    ["financial_app.audit_changes", 2],
  ]);
});

test("rechaza dumps truncados, duplicados o con formatos que no puede cotejar", () => {
  for (const invalid of [
    "-- no data",
    "COPY financial_app.documents (id) FROM stdin;\n1\n",
    "COPY financial_app.documents (id) FROM stdin;\n\\.\nCOPY financial_app.documents (id) FROM stdin;\n\\.\n",
    "COPY other.documents (id) FROM stdin;\n\\.\n",
    dump + "INSERT INTO financial_app.documents VALUES (1);\n",
  ]) assert.throws(() => copyRowCounts(invalid), /backup_v2_row_count_/);
});

test("detecta filas perdidas, añadidas y resultados incompletos o repetidos", () => {
  const expected = copyRowCounts(dump);
  const rows = [...expected].map(([table, count]) => ({ table, rows: String(count) }));
  assert.deepEqual(verifyRowCounts(expected, rows), { status: "backup_v2_restored_row_counts_ok", tables: 3 });
  for (const count of ["1", "3"]) {
    assert.throws(() => verifyRowCounts(expected, [{ ...rows[0], rows: count }, ...rows.slice(1)]), /mismatch/);
  }
  assert.throws(() => verifyRowCounts(expected, rows.slice(1)), /missing_result/);
  assert.throws(() => verifyRowCounts(expected, [rows[0], rows[0], rows[2]]), /invalid_result/);
  assert.throws(() => verifyRowCounts(expected, [{ table: "private-value", rows: "1" }]), /invalid_result/);
});
