import assert from "node:assert/strict";
import { registerAtomicDriveDocumentBatch } from "../src/domain/atomic-drive-document-batch.ts";

function fakeDb(committed) {
  let begins = 0;
  return {
    get begins() { return begins; },
    async begin(work) {
      begins += 1;
      const staging = [];
      await work({ stage: (row) => staging.push(row) });
      // A PostgreSQL BEGIN transaction is atomic: only committed after
      // successful completion, not after each individual query.
      committed.push(...staging);
    },
  };
}

// REC-DRIVE-134: a failure after a previous write must roll back the entire batch.
{
  const committed = ["existing"];
  const db = fakeDb(committed);
  let calls = 0;
  await assert.rejects(
    registerAtomicDriveDocumentBatch(["first", "broken", "never-reached"], db, async (tx, row) => {
      calls += 1;
      if (row === "broken") throw new Error("synthetic_db_failure");
      tx.stage(row);
    }), /synthetic_db_failure/,
  );
  assert.deepEqual(committed, ["existing"]);
  assert.equal(db.begins, 1);
  assert.equal(calls, 2);
  process.stdout.write("PASS REC-DRIVE-134: failed batch rolls back all staged records\n");
}

// REC-DRIVE-135: a full success commits exactly once and reports the correct count.
{
  const committed = [];
  const db = fakeDb(committed);
  const imported = await registerAtomicDriveDocumentBatch(
    ["alpha", "beta", "gamma"], db, async (tx, row) => tx.stage(row),
  );
  assert.equal(imported, 3);
  assert.equal(db.begins, 1);
  assert.deepEqual(committed, ["alpha", "beta", "gamma"]);
  process.stdout.write("PASS REC-DRIVE-135: entire batch committed once\n");
}

// REC-DRIVE-136: unsafe batches never even begin a database transaction.
{
  const committed = [];
  const db = fakeDb(committed);
  for (const invalid of [[], new Array(201).fill("excess")]) {
    await assert.rejects(
      registerAtomicDriveDocumentBatch(invalid, db, async (tx, row) => tx.stage(row)),
      /invalid_document_drive_batch/,
    );
  }
  assert.equal(db.begins, 0);
  assert.deepEqual(committed, []);
  process.stdout.write("PASS REC-DRIVE-136: invalid batches blocked before any DB transaction\n");
}
