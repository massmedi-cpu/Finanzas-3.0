import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function fail(reason) {
  throw new Error(`backup_v2_row_count_${reason}`);
}

// pg_dump's default COPY text format escapes embedded newlines, so each data
// line is one row. Read the dump itself to use the snapshot already backed up.
export function copyRowCounts(dataSql) {
  const counts = new Map();
  let table = null;
  for (const line of dataSql.split(/\r?\n/)) {
    if (table !== null) {
      if (line === "\\.") table = null;
      else counts.set(table, counts.get(table) + 1);
      continue;
    }
    if (/^INSERT\s+INTO\b/i.test(line)) fail("unsupported_insert_format");
    if (!/^COPY\b/i.test(line)) continue;
    const match = /^COPY (?:financial_app|"financial_app")\.(?:([a-z_][a-z0-9_]*)|"([a-z_][a-z0-9_]*)") \([^\r\n]+\) FROM stdin;$/.exec(line);
    if (!match) fail("unsupported_copy_format");
    table = `financial_app.${match[1] ?? match[2]}`;
    if (counts.has(table)) fail("duplicate_copy_table");
    counts.set(table, 0);
  }
  if (table !== null) fail("unterminated_copy");
  if (counts.size === 0) fail("missing_copy_data");
  return counts;
}

export function rowCountQuery(counts) {
  // Names originate only from the restricted identifier grammar above.
  return [...counts.keys()].map((table) => {
    const name = table.slice("financial_app.".length);
    return `SELECT json_build_object('table', '${table}', 'rows', count(*)::text)::text FROM ONLY financial_app."${name}"`;
  }).join("\nUNION ALL\n") + ";\n";
}

export function verifyRowCounts(expected, rows) {
  if (!Array.isArray(rows)) fail("invalid_result");
  const seen = new Set();
  for (const row of rows) {
    if (!row || !expected.has(row.table) || seen.has(row.table)
      || typeof row.rows !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(row.rows)) {
      fail("invalid_result");
    }
    if (row.rows !== String(expected.get(row.table))) fail(`mismatch: ${row.table}`);
    seen.add(row.table);
  }
  if (seen.size !== expected.size) fail("missing_result");
  return { status: "backup_v2_restored_row_counts_ok", tables: seen.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, backupDir] = process.argv.slice(2);
    if (!["--sql", "--verify"].includes(mode) || !backupDir) fail("invalid_arguments");
    const expected = copyRowCounts(readFileSync(resolve(backupDir, "data.sql"), "utf8"));
    if (mode === "--sql") process.stdout.write(rowCountQuery(expected));
    else {
      const input = readFileSync(0, "utf8").trim();
      const rows = input ? input.split("\n").map((line) => JSON.parse(line)) : [];
      console.log(JSON.stringify(verifyRowCounts(expected, rows)));
    }
  } catch (error) {
    // No SQL row contents or PostgreSQL output are included in failure logs.
    const message = error instanceof Error && error.message.startsWith("backup_v2_row_count_")
      ? error.message : "backup_v2_row_count_unreadable_input";
    console.error(message);
    process.exitCode = 1;
  }
}
