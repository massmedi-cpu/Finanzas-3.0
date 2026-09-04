import type {
  PreparedSourceSyncBatch,
  SourceSyncBatchResult,
  SourceSyncFailure,
  SourceSyncPersistence,
} from "../../application/source-sync-service";
import { callPersistenceGateway } from "./vercel-supabase-gateway";

export class EdgeSourceSyncPersistence implements SourceSyncPersistence {
  async syncBatch(batch: PreparedSourceSyncBatch): Promise<SourceSyncBatchResult> {
    const response = await callPersistenceGateway<SourceSyncBatchResult>("source.sync_batch", { batch });
    return response;
  }

  async recordFailure(failure: SourceSyncFailure): Promise<{ syncRunId: string }> {
    return callPersistenceGateway<{ syncRunId: string }>("source.record_failure", { failure });
  }
}
