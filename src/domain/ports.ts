import type {
  Account,
  AuditChange,
  Budget,
  Category,
  DocumentRecord,
  DocumentTransactionAssociation,
  EntityId,
  ForecastItem,
  Merchant,
  MerchantAlias,
  Recurrence,
  SyncRun,
  Transaction,
  TransactionOverride,
  TransactionSourceRecord,
} from "./models";

export interface PageRequest {
  limit: number;
  cursor?: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface AccountRepository {
  list(): Promise<Account[]>;
  getById(id: EntityId): Promise<Account | null>;
  save(account: Account): Promise<Account>;
  reorder(orderedIds: EntityId[]): Promise<void>;
}

export interface CategoryRepository {
  list(): Promise<Category[]>;
  getById(id: EntityId): Promise<Category | null>;
  save(category: Category): Promise<Category>;
  reorder(orderedIds: EntityId[]): Promise<void>;
  merge(sourceCategoryId: EntityId, targetCategoryId: EntityId): Promise<void>;
}

export interface MerchantRepository {
  list(page: PageRequest): Promise<Page<Merchant>>;
  getById(id: EntityId): Promise<Merchant | null>;
  save(merchant: Merchant): Promise<Merchant>;
  listAliases(merchantId: EntityId): Promise<MerchantAlias[]>;
  saveAlias(alias: MerchantAlias): Promise<MerchantAlias>;
}

/**
 * Puerto deliberadamente append-only para la capa bancaria original.
 * No expone update/delete. Una corrección externa de una fila produce una
 * nueva instantánea que apunta a la observación anterior.
 */
export interface TransactionSourceRepository {
  getById(id: EntityId): Promise<TransactionSourceRecord | null>;
  findByFingerprint(sourceFingerprint: string): Promise<TransactionSourceRecord | null>;
  findLatestByRowIdentity(sourceRowIdentity: string): Promise<TransactionSourceRecord | null>;
  insert(record: TransactionSourceRecord): Promise<TransactionSourceRecord>;
  insertMany(records: TransactionSourceRecord[]): Promise<TransactionSourceRecord[]>;
}

export interface TransactionRepository {
  getById(id: EntityId): Promise<Transaction | null>;
  getBySourceRowIdentity(sourceRowIdentity: string): Promise<Transaction | null>;
  list(page: PageRequest): Promise<Page<Transaction>>;
  save(transaction: Transaction): Promise<Transaction>;
}

export interface TransactionOverrideRepository {
  getForTransaction(transactionId: EntityId): Promise<TransactionOverride | null>;
  save(override: TransactionOverride): Promise<TransactionOverride>;
}

export interface BudgetRepository {
  listForMonth(month: string): Promise<Budget[]>;
  save(budget: Budget): Promise<Budget>;
}

export interface RecurrenceRepository {
  list(): Promise<Recurrence[]>;
  getById(id: EntityId): Promise<Recurrence | null>;
  save(recurrence: Recurrence): Promise<Recurrence>;
}

export interface ForecastRepository {
  listBetween(startDate: string, endDate: string): Promise<ForecastItem[]>;
  save(item: ForecastItem): Promise<ForecastItem>;
}

export interface DocumentRepository {
  list(page: PageRequest): Promise<Page<DocumentRecord>>;
  getById(id: EntityId): Promise<DocumentRecord | null>;
  save(document: DocumentRecord): Promise<DocumentRecord>;
}

export interface DocumentAssociationRepository {
  listForDocument(documentId: EntityId): Promise<DocumentTransactionAssociation[]>;
  listForTransaction(transactionId: EntityId): Promise<DocumentTransactionAssociation[]>;
  save(association: DocumentTransactionAssociation): Promise<DocumentTransactionAssociation>;
  remove(associationId: EntityId): Promise<void>;
}

export interface SyncRunRepository {
  getById(id: EntityId): Promise<SyncRun | null>;
  getLatestForSource(sourceFileId: string): Promise<SyncRun | null>;
  save(run: SyncRun): Promise<SyncRun>;
}

export interface AuditRepository {
  listForEntity(entityType: AuditChange["entityType"], entityId: EntityId): Promise<AuditChange[]>;
  append(change: AuditChange): Promise<AuditChange>;
}

export interface FinancialUnitOfWork {
  accounts: AccountRepository;
  categories: CategoryRepository;
  merchants: MerchantRepository;
  transactionSources: TransactionSourceRepository;
  transactions: TransactionRepository;
  transactionOverrides: TransactionOverrideRepository;
  budgets: BudgetRepository;
  recurrences: RecurrenceRepository;
  forecasts: ForecastRepository;
  documents: DocumentRepository;
  documentAssociations: DocumentAssociationRepository;
  syncRuns: SyncRunRepository;
  audit: AuditRepository;
}

export interface TransactionRunner {
  run<T>(work: (unitOfWork: FinancialUnitOfWork) => Promise<T>): Promise<T>;
}
