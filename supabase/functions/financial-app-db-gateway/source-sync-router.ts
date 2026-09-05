import { handleSourceSyncAction as handleLegacySourceSyncAction } from "./source-sync.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function stableReplayCandidate(batch: any) {
  return Boolean(
    batch &&
      typeof batch === "object" &&
      !Array.isArray(batch) &&
      typeof batch.sourceFileId === "string" &&
      batch.sourceFileId.trim() &&
      typeof batch.sourceRevision === "string" &&
      batch.sourceRevision.trim() &&
      typeof batch.schemaFingerprint === "string" &&
      /^[0-9a-f]{64}$/.test(batch.schemaFingerprint) &&
      Array.isArray(batch.accounts) &&
      batch.accounts.length > 0 &&
      Array.isArray(batch.observations) &&
      batch.observations.length > 0,
  );
}

function expectedLastRowBySheet(observations: any[]) {
  const rows = new Map<string, string>();
  for (const observation of observations) {
    if (
      !observation ||
      typeof observation !== "object" ||
      Array.isArray(observation) ||
      typeof observation.sourceSheetId !== "string" ||
      !observation.sourceSheetId.trim() ||
      typeof observation.sourceRowKey !== "string" ||
      !observation.sourceRowKey.trim()
    ) {
      return null;
    }
    rows.set(observation.sourceSheetId, observation.sourceRowKey);
  }
  return rows;
}

async function tryStableRevisionReplay(payload: any, sql: any): Promise<Response | null> {
  const batch = payload?.batch;
  if (!stableReplayCandidate(batch)) return null;

  const sourceRowIdentities: string[] = [];
  const sourceFingerprints: string[] = [];
  for (const observation of batch.observations) {
    if (
      typeof observation?.sourceRowIdentity !== "string" ||
      !observation.sourceRowIdentity.trim() ||
      typeof observation?.sourceFingerprint !== "string" ||
      !/^[0-9a-f]{64}$/.test(observation.sourceFingerprint)
    ) {
      return null;
    }
    sourceRowIdentities.push(observation.sourceRowIdentity);
    sourceFingerprints.push(observation.sourceFingerprint);
  }
  if (new Set(sourceRowIdentities).size !== sourceRowIdentities.length) return null;

  const accountExternalKeys = batch.accounts.map((account: any) => account?.accountExternalKey);
  if (
    accountExternalKeys.some((value: unknown) => typeof value !== "string" || !value.trim()) ||
    new Set(accountExternalKeys).size !== accountExternalKeys.length
  ) {
    return null;
  }

  const lastRowBySheet = expectedLastRowBySheet(batch.observations);
  if (!lastRowBySheet?.size) return null;

  let replayResult: Record<string, unknown> | null = null;
  await sql.begin(async (tx: any) => {
    await tx`select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(${'financial_app.source_sync:' + batch.sourceFileId}))`;

    const previousRows = await tx`
      select id,duplicates_detected
      from financial_app.sync_runs
      where source_file_id=${batch.sourceFileId}
        and source_revision=${batch.sourceRevision}
        and schema_fingerprint=${batch.schemaFingerprint}
        and status='success'
        and rows_seen=${batch.observations.length}
        and rows_failed=0
        and warnings_count=0
      order by started_at desc,id desc
      limit 1
    `;
    if (!previousRows[0]?.id) return;

    const snapshotRows = await tx`
      select count(*)::int as matched
      from unnest(${sourceRowIdentities}::text[],${sourceFingerprints}::text[])
        as expected(source_row_identity,source_fingerprint)
      join financial_app.transactions t
        on t.source_row_identity=expected.source_row_identity
      join financial_app.transaction_source_records sr
        on sr.id=t.source_record_id
       and sr.source_file_id=${batch.sourceFileId}
       and sr.source_row_identity=expected.source_row_identity
       and sr.source_fingerprint=expected.source_fingerprint
    `;
    if (snapshotRows[0]?.matched !== batch.observations.length) return;

    const mappingRows = await tx`
      select account_external_key
      from financial_app.account_source_mappings
      where source_file_id=${batch.sourceFileId}
      order by account_external_key
    `;
    if (mappingRows.length !== accountExternalKeys.length) return;
    const mappedKeys = new Set(mappingRows.map((row: any) => row.account_external_key));
    if (accountExternalKeys.some((key: string) => !mappedKeys.has(key))) return;

    const cursorRows = await tx`
      select source_sheet_id,source_revision,last_source_row_key
      from financial_app.sync_cursors
      where source_file_id=${batch.sourceFileId}
      order by source_sheet_id
    `;
    if (cursorRows.length !== lastRowBySheet.size) return;
    for (const cursor of cursorRows) {
      if (
        cursor.source_revision !== batch.sourceRevision ||
        lastRowBySheet.get(cursor.source_sheet_id) !== cursor.last_source_row_key
      ) {
        return;
      }
    }

    const duplicateRows = await tx`
      select count(*)::int as count
      from financial_app.transactions t
      join financial_app.transaction_source_records sr on sr.id=t.source_record_id
      where sr.source_file_id=${batch.sourceFileId}
        and t.duplicate_state='suspected'
    `;
    const duplicatesDetected = duplicateRows[0]?.count ?? previousRows[0]?.duplicates_detected ?? 0;

    const runRows = await tx`
      insert into financial_app.sync_runs (
        source_file_id,source_revision,status,finished_at,rows_seen,rows_inserted,rows_revised,
        rows_skipped,rows_failed,duplicates_detected,warnings_count,schema_fingerprint,error_code,error_message
      ) values (
        ${batch.sourceFileId},${batch.sourceRevision},'success',now(),${batch.observations.length},0,0,
        ${batch.observations.length},0,${duplicatesDetected},0,${batch.schemaFingerprint},null,null
      ) returning id
    `;
    const syncRunId = runRows[0]?.id;
    if (!syncRunId) throw new Error("stable_revision_sync_run_missing");

    for (const [sourceSheetId, lastSourceRowKey] of lastRowBySheet) {
      await tx`
        update financial_app.sync_cursors
        set last_successful_run_id=${syncRunId}::uuid,updated_at=now()
        where source_file_id=${batch.sourceFileId}
          and source_sheet_id=${sourceSheetId}
          and source_revision=${batch.sourceRevision}
          and last_source_row_key=${lastSourceRowKey}
      `;
    }

    replayResult = {
      syncRunId,
      status: "success",
      rowsSeen: batch.observations.length,
      rowsInserted: 0,
      rowsRevised: 0,
      rowsSkipped: batch.observations.length,
      rowsMissing: 0,
      duplicatesDetected,
      warningsCount: 0,
      cursorsAdvanced: lastRowBySheet.size,
      stableRevisionReplay: true,
    };
  });

  return replayResult ? json(replayResult) : null;
}

export async function handleSourceSyncAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  if (input.action === "source.sync_batch") {
    const replay = await tryStableRevisionReplay(input.payload, input.sql);
    if (replay) return replay;
  }
  return handleLegacySourceSyncAction(input);
}
