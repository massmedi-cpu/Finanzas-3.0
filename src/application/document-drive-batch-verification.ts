/**
 * Verify a bounded number of Google Drive originals concurrently before
 * performing a SINGLE metadata registration. No backend/database writes
 * happen here: all results must succeed before the caller proceeds.
 *
 * Results preserve the source order regardless of Google response order.
 * After a failure, no new downloads are scheduled; already in-flight reads
 * are allowed to settle before the caller receives the rejection.
 */
export async function verifyDriveDocumentBatchMetadata<Input, Output>(
  files: readonly Input[],
  verify: (file: Input, index: number) => Promise<Output>,
  concurrency = 4,
): Promise<Output[]> {
  if (files.length < 1 || files.length > 200
    || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("invalid_document_drive_batch");
  }

  const results = new Array<Output>(files.length);
  let nextIndex = 0;
  let failed = false;
  let failure: unknown;

  async function worker() {
    while (!failed && nextIndex < files.length) {
      const index = nextIndex++;
      try {
        results[index] = await verify(files[index], index);
      } catch (error) {
        failed = true;
        failure = error;
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(concurrency, files.length) },
    () => worker(),
  ));

  if (failed) throw failure;
  return results;
}
