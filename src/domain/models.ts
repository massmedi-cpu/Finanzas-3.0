export type EntityId = string;
export type ISODate = string;
export type ISOTimestamp = string;
export type YearMonth = string;
export type MoneyCents = number;

export type EntityLifecycle = "active" | "archived";
export type AccountType =
  | "checking"
  | "savings"
  | "credit"
  | "cash"
  | "investment"
  | "other";

export type CategoryKind = "income" | "expense" | "transfer";
export type TransactionKind =
  | "income"
  | "expense"
  | "transfer"
  | "refund"
  | "adjustment";
export type TransactionReviewState = "confirmed" | "pending" | "needs_review";
export type DuplicateState = "none" | "suspected" | "confirmed";
export type RuleStatus = "active" | "disabled";
export type RecurrenceStatus = "active" | "ignored" | "archived";
export type DocumentType = "ticket" | "invoice" | "other";
export type DocumentStatus = "imported" | "pending_review" | "confirmed" | "archived";
export type AssociationMethod = "manual" | "suggested" | "automatic";
export type ForecastOrigin = "known" | "recurring" | "budget" | "manual" | "inferred";
export type ForecastConfidence = "high" | "medium" | "low";
export type SyncRunStatus = "started" | "success" | "partial" | "failed";
export type AuditEntityType =
  | "account"
  | "category"
  | "merchant"
  | "transaction"
  | "budget"
  | "recurrence"
  | "forecast"
  | "document"
  | "rule";

export interface Account {
  id: EntityId;
  name: string;
  institution: string | null;
  type: AccountType;
  openingBalanceCents: MoneyCents;
  currency: "EUR";
  lifecycle: EntityLifecycle;
  sortOrder: number;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface Category {
  id: EntityId;
  name: string;
  kind: CategoryKind;
  parentCategoryId: EntityId | null;
  iconKey: string;
  colorToken: string;
  lifecycle: EntityLifecycle;
  sortOrder: number;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface Merchant {
  id: EntityId;
  normalizedName: string;
  defaultCategoryId: EntityId | null;
  lifecycle: EntityLifecycle;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface MerchantAlias {
  id: EntityId;
  merchantId: EntityId;
  alias: string;
  normalizedAlias: string;
  createdAt: ISOTimestamp;
}

/**
 * Capa 1: representación inmutable del dato bancario recibido de la fuente.
 * No contiene correcciones manuales del usuario.
 */
export interface TransactionSourceRecord {
  id: EntityId;
  sourceFileId: string;
  sourceSheetId: string | null;
  sourceRowKey: string;
  sourceFingerprint: string;
  sourcePayload: Readonly<Record<string, unknown>>;
  bankDate: ISODate;
  conceptOriginal: string;
  amountCents: MoneyCents;
  balanceAfterCents: MoneyCents | null;
  accountExternalKey: string;
  importedAt: ISOTimestamp;
}

/**
 * Capa 2: dato financiero procesado y normalizado por Financial App.
 * Mantiene referencia obligatoria al registro original.
 */
export interface Transaction {
  id: EntityId;
  sourceRecordId: EntityId;
  accountId: EntityId;
  bankDate: ISODate;
  conceptNormalized: string;
  merchantId: EntityId | null;
  categoryId: EntityId | null;
  kind: TransactionKind;
  amountCents: MoneyCents;
  balanceAfterCents: MoneyCents | null;
  reviewState: TransactionReviewState;
  duplicateState: DuplicateState;
  transferPairId: EntityId | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

/**
 * Capa 3: modificaciones explícitas del usuario.
 * Nunca sobreescribe el registro bancario original.
 *
 * merchantOverrideSet/categoryOverrideSet permiten diferenciar entre
 * "sin modificación" y "el usuario ha vaciado expresamente el valor".
 * Se mantienen opcionales para compatibilidad acumulativa con registros
 * creados antes de introducir esta distinción.
 */
export interface TransactionOverride {
  id: EntityId;
  transactionId: EntityId;
  conceptOverride: string | null;
  merchantIdOverride: EntityId | null;
  merchantOverrideSet?: boolean;
  categoryIdOverride: EntityId | null;
  categoryOverrideSet?: boolean;
  kindOverride: TransactionKind | null;
  excludedFromAnalytics: boolean;
  reviewStateOverride: TransactionReviewState | null;
  note: string | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface CategorizationRule {
  id: EntityId;
  name: string;
  status: RuleStatus;
  priority: number;
  conceptContains: string | null;
  merchantId: EntityId | null;
  accountId: EntityId | null;
  minimumAmountCents: MoneyCents | null;
  maximumAmountCents: MoneyCents | null;
  targetCategoryId: EntityId | null;
  targetMerchantId: EntityId | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface Recurrence {
  id: EntityId;
  merchantId: EntityId | null;
  categoryId: EntityId | null;
  accountId: EntityId | null;
  conceptPattern: string;
  status: RecurrenceStatus;
  intervalUnit: "week" | "month" | "quarter" | "year";
  intervalCount: number;
  usualAmountCents: MoneyCents;
  amountToleranceCents: MoneyCents;
  nextEstimatedDate: ISODate | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface Budget {
  id: EntityId;
  month: YearMonth;
  categoryId: EntityId | null;
  automaticAmountCents: MoneyCents;
  manualAmountCents: MoneyCents | null;
  explanation: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface ForecastItem {
  id: EntityId;
  date: ISODate;
  accountId: EntityId | null;
  categoryId: EntityId | null;
  merchantId: EntityId | null;
  concept: string;
  amountCents: MoneyCents;
  origin: ForecastOrigin;
  confidence: ForecastConfidence;
  recurrenceId: EntityId | null;
  budgetId: EntityId | null;
  confirmedTransactionId: EntityId | null;
  excluded: boolean;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface DocumentRecord {
  id: EntityId;
  type: DocumentType;
  status: DocumentStatus;
  originalFileName: string;
  mimeType: string;
  storageProvider: "supabase" | "google_drive";
  storageKey: string;
  sourceDriveFileId: string | null;
  documentDate: ISODate | null;
  issuerName: string | null;
  totalCents: MoneyCents | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface DocumentTransactionAssociation {
  id: EntityId;
  documentId: EntityId;
  transactionId: EntityId;
  method: AssociationMethod;
  confidence: number | null;
  confirmed: boolean;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface SyncRun {
  id: EntityId;
  sourceFileId: string;
  sourceRevision: string | null;
  status: SyncRunStatus;
  startedAt: ISOTimestamp;
  finishedAt: ISOTimestamp | null;
  rowsSeen: number;
  rowsInserted: number;
  rowsSkipped: number;
  duplicatesDetected: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface AuditChange {
  id: EntityId;
  entityType: AuditEntityType;
  entityId: EntityId;
  fieldName: string;
  originalValue: unknown;
  newValue: unknown;
  changedAt: ISOTimestamp;
}
