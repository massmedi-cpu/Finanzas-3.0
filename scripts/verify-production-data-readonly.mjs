import { spawnSync } from "node:child_process";

const dbUrl = process.env.FINANCIAL_APP_DB_URL ?? "";
let connection = null;

function fail(message) {
  throw new Error(message);
}

function decode(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail(`FINANCIAL_APP_DB_URL contains an invalid ${label}.`);
  }
}

function parseConnection() {
  let url;
  try {
    url = new URL(dbUrl);
  } catch {
    fail("FINANCIAL_APP_DB_URL must be a valid PostgreSQL URI.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) fail("PostgreSQL URI required.");
  const parsed = {
    host: url.hostname,
    port: url.port || "5432",
    user: decode(url.username, "username"),
    password: decode(url.password, "password"),
    database: decode(url.pathname.replace(/^\/+/, ""), "database"),
    sslmode: url.searchParams.get("sslmode") || "require",
  };
  if (!parsed.host || !parsed.user || !parsed.password || !parsed.database) fail("Incomplete PostgreSQL URI.");
  return parsed;
}

function sanitized(value) {
  let text = String(value ?? "");
  if (dbUrl) text = text.split(dbUrl).join("[REDACTED_DB_URL]");
  if (connection?.password) text = text.split(connection.password).join("[REDACTED_DB_PASSWORD]");
  return text;
}

function queryJson(sql) {
  const env = {
    ...process.env,
    PGPASSWORD: connection.password,
    PGSSLMODE: connection.sslmode,
    PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=15000",
  };
  const result = spawnSync("psql", [
    "-X", "-A", "-t", "--no-password",
    "--host", connection.host,
    "--port", connection.port,
    "--username", connection.user,
    "--dbname", connection.database,
    "--set", "ON_ERROR_STOP=1",
    "--command", sql,
  ], { encoding: "utf8", env, shell: false });
  if (result.status !== 0) fail(`read-only production query failed: ${sanitized(result.stderr || result.stdout)}`);
  try {
    return JSON.parse((result.stdout ?? "").trim());
  } catch {
    fail("read-only production query returned invalid JSON.");
  }
}

function assertZero(snapshot, key) {
  if (snapshot[key] !== 0) fail(`${key} must be zero, received ${snapshot[key]}`);
}

try {
  if (!dbUrl) fail("FINANCIAL_APP_DB_URL is required.");
  connection = parseConnection();

  const snapshot = queryJson(`
    select pg_catalog.json_build_object(
      'schemaRows', (select count(*)::int from financial_app.schema_meta where id=true),
      'schemaVersion', (select schema_version from financial_app.schema_meta where id=true),
      'bankSourcePolicy', (select bank_source_policy from financial_app.schema_meta where id=true),
      'locale', (select locale from financial_app.schema_meta where id=true),
      'currency', (select currency from financial_app.schema_meta where id=true),
      'timeZone', (select time_zone from financial_app.schema_meta where id=true),
      'workspaces', (select count(*)::int from financial_app.workspaces),
      'accounts', (select count(*)::int from financial_app.accounts),
      'sourceRecords', (select count(*)::int from financial_app.transaction_source_records),
      'transactions', (select count(*)::int from financial_app.transactions),
      'documents', (select count(*)::int from financial_app.documents),
      'documentAssociations', (select count(*)::int from financial_app.document_transaction_associations),
      'minTransactionDate', (select min(bank_date)::text from financial_app.transactions),
      'maxTransactionDate', (select max(bank_date)::text from financial_app.transactions),
      'transactionsWithoutSource', (
        select count(*)::int from financial_app.transactions where source_record_id is null
      ),
      'transactionsWithoutAccount', (
        select count(*)::int from financial_app.transactions where account_id is null
      ),
      'sourceRecordsWithoutTransaction', (
        select count(*)::int
        from financial_app.transaction_source_records sr
        left join financial_app.transactions t
          on t.source_record_id=sr.id and t.workspace_id=sr.workspace_id
        where t.id is null
      ),
      'orphanSourceRecords', (
        select count(*)::int
        from financial_app.transactions t
        left join financial_app.transaction_source_records sr
          on sr.id=t.source_record_id and sr.workspace_id=t.workspace_id
        where t.source_record_id is not null and sr.id is null
      ),
      'orphanAccounts', (
        select count(*)::int
        from financial_app.transactions t
        left join financial_app.accounts a
          on a.id=t.account_id and a.workspace_id=t.workspace_id
        where t.account_id is not null and a.id is null
      ),
      'orphanDocumentLinks', (
        select count(*)::int
        from financial_app.document_transaction_associations x
        left join financial_app.documents d
          on d.id=x.document_id and d.workspace_id=x.workspace_id
        left join financial_app.transactions t
          on t.id=x.transaction_id and t.workspace_id=x.workspace_id
        where d.id is null or t.id is null
      ),
      'duplicateSourceIdentities', (
        select count(*)::int from (
          select workspace_id, source_row_identity
          from financial_app.transaction_source_records
          where source_row_identity is not null
          group by workspace_id, source_row_identity
          having count(*) > 1
        ) q
      ),
      'repeatedSourceRecordLinks', (
        select count(*)::int from (
          select workspace_id, source_record_id
          from financial_app.transactions
          where source_record_id is not null
          group by workspace_id, source_record_id
          having count(*) > 1
        ) q
      ),
      'nonEurAccounts', (select count(*)::int from financial_app.accounts where currency <> 'EUR'),
      'documentsWithoutWorkspace', (select count(*)::int from financial_app.documents where workspace_id is null),
      'futureTransactions', (select count(*)::int from financial_app.transactions where bank_date > current_date)
    )::text
  `);

  if (snapshot.schemaRows !== 1) fail(`schemaRows must be 1, received ${snapshot.schemaRows}`);
  if (!Number.isInteger(snapshot.schemaVersion) || snapshot.schemaVersion < 14) fail("schemaVersion must be >= 14.");
  if (snapshot.bankSourcePolicy !== "read_only") fail("bankSourcePolicy must remain read_only.");
  if (snapshot.locale !== "es-ES" || snapshot.currency !== "EUR" || snapshot.timeZone !== "Europe/Madrid") {
    fail("regional production contract drifted.");
  }
  if (!Number.isInteger(snapshot.workspaces) || snapshot.workspaces < 1) fail("at least one workspace is required.");
  if (!Number.isInteger(snapshot.accounts) || snapshot.accounts < 1) fail("at least one account is required.");
  if (!Number.isInteger(snapshot.sourceRecords) || snapshot.sourceRecords < 1) fail("source records are unexpectedly empty.");
  if (!Number.isInteger(snapshot.transactions) || snapshot.transactions < 1) fail("transactions are unexpectedly empty.");
  if (snapshot.sourceRecords !== snapshot.transactions) fail("source record / transaction cardinality drift detected.");
  if (!snapshot.minTransactionDate || !snapshot.maxTransactionDate) fail("transaction date coverage is missing.");

  for (const key of [
    "transactionsWithoutSource",
    "transactionsWithoutAccount",
    "sourceRecordsWithoutTransaction",
    "orphanSourceRecords",
    "orphanAccounts",
    "orphanDocumentLinks",
    "duplicateSourceIdentities",
    "repeatedSourceRecordLinks",
    "nonEurAccounts",
    "documentsWithoutWorkspace",
    "futureTransactions",
  ]) assertZero(snapshot, key);

  console.log(JSON.stringify({
    status: "production_data_readonly_ok",
    schemaVersion: snapshot.schemaVersion,
    bankSourcePolicy: snapshot.bankSourcePolicy,
    regionalContract: `${snapshot.locale}/${snapshot.currency}/${snapshot.timeZone}`,
    workspaces: snapshot.workspaces,
    accounts: snapshot.accounts,
    sourceRecords: snapshot.sourceRecords,
    transactions: snapshot.transactions,
    documents: snapshot.documents,
    documentAssociations: snapshot.documentAssociations,
    transactionDateRange: [snapshot.minTransactionDate, snapshot.maxTransactionDate],
    integrityViolations: 0,
    queryMode: "default_transaction_read_only=on",
  }));
} catch (error) {
  console.error(`production_data_readonly_failed: ${sanitized(error instanceof Error ? error.message : String(error))}`);
  process.exit(1);
}
