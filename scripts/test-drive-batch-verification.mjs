import assert from "node:assert/strict";
import { verifyDriveDocumentBatchMetadata } from "../src/application/document-drive-batch-verification.ts";

// REC-DRIVE-137: concurrent validation preserves original inventory order.
{
  let running = 0;
  let peak = 0;
  const results = await verifyDriveDocumentBatchMetadata(
    Array.from({ length: 13 }, (_, i) => i),
    async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, (13 - item) % 4));
      running -= 1;
      return { item, verified: true };
    },
  );
  assert.ok(peak > 1 && peak <= 4, `parallel limit must be 4; observed ${peak}`);
  assert.deepEqual(results.map(({ item }) => item), Array.from({ length: 13 }, (_, i) => i));
  process.stdout.write("PASS REC-DRIVE-137: bounded concurrent metadata verification preserves order\n");
}

// REC-DRIVE-138: on a verifier failure, no further work is started and
// the caller receives NO partial result to accidentally persist.
{
  let launched = 0;
  let running = 0;
  const calls = [];
  const pending = [];
  const work = verifyDriveDocumentBatchMetadata(
    Array.from({ length: 20 }, (_, i) => i),
    (item) => new Promise((resolve, reject) => {
      launched += 1;
      running += 1;
      calls.push(item);
      pending.push({ item, finish: () => { running -= 1; resolve(item); }, fail: () => { running -= 1; reject(new Error("google_source_changed")); } });
    }),
    3,
  );
  assert.equal(launched, 3);
  pending[0].fail();
  pending[1].finish();
  pending[2].finish();
  await assert.rejects(work, /google_source_changed/);
  assert.equal(launched, 3);
  assert.equal(running, 0);
  assert.deepEqual(calls, [0, 1, 2]);
  process.stdout.write("PASS REC-DRIVE-138: failure settles in-flight requests, never returns a partial batch\n");
}

// REC-DRIVE-139: reject invalid inventory/concurrency without reading Drive.
{
  let count = 0;
  const verify = async (file) => { count += 1; return file; };
  for (const [files, concurrency] of [
    [[], 4], [Array(201).fill("x"), 4], [["a"], 0],
    [["a"], 9], [["a"], 1.5],
  ]) {
    await assert.rejects(
      verifyDriveDocumentBatchMetadata(files, verify, concurrency),
      /invalid_document_drive_batch/,
    );
  }
  assert.equal(count, 0);
  process.stdout.write("PASS REC-DRIVE-139: invalid batch blocked before any Google request\n");
}
