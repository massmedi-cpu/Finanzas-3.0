/**
 * Write one verified Drive inventory batch as a single PostgreSQL transaction.
 *
 * All results are reported only AFTER the database commits successfully.
 * If any registration rejects, the transaction's database driver must roll
 * back the complete batch. Never insert through the root SQL connection inside
 * the transaction: all writes must use the supplied transaction handle.
 *
 * The caller validates the complete input BEFORE invoking this helper.
 * Google Drive originals remain read-only; only document metadata is written.
 */
export async function registerAtomicDriveDocumentBatch<Row, Tx>(
  rows: readonly Row[],
  database: {
    begin: (callback: (transaction: Tx) => Promise<void>) => Promise<unknown>;
  },
  register: (transaction: Tx, row: Row) => Promise<unknown>,
): Promise<number> {
  if (rows.length < 1 || rows.length > 200) {
    throw new Error("invalid_document_drive_batch");
  }
  await database.begin(async (transaction) => {
    for (const row of rows) {
      await register(transaction, row);
    }
  });
  // Never imply partial success; this line is unreachable on rollback.
  return rows.length;
}
