import { SourceSyncService } from "../../application/source-sync-service";
import { EdgeSourceSyncPersistence } from "./edge-source-sync-persistence";

export function createEdgeSourceSyncService() {
  return new SourceSyncService(new EdgeSourceSyncPersistence());
}
