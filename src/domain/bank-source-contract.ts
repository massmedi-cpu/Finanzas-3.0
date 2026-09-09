export interface BankSourceContract<Snapshot, SyncBatch> {
  readonly id: string;
  readonly displayName: string;
  readonly readOnly: true;
  prepareSyncBatch(snapshot: Snapshot): SyncBatch;
}
