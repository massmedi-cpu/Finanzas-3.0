export const FINANCIAL_INVARIANTS = {
  bankSource: {
    mutable: false,
    authority: "external-bank-source",
    description:
      "Movimientos bancarios - fuente es externa, inmutable y solo lectura.",
  },
  transactionLayers: [
    "source-record",
    "processed-transaction",
    "user-override",
  ],
  calculations: {
    singleEngine: true,
    transfersAffectIncomeExpense: false,
    dashboardRecalculatesIndependently: false,
  },
  synchronization: {
    incremental: true,
    idempotent: true,
    preservesUserOverrides: true,
    writesToSource: false,
  },
  deletion: {
    importedBankTransactionsCanBeDeleted: false,
  },
} as const;

export const SOURCE_OF_TRUTH = {
  accounts: "accounts",
  sourceTransactions: "transaction_source_records",
  transactions: "transactions",
  transactionOverrides: "transaction_overrides",
  categories: "categories",
  merchants: "merchants",
  budgets: "budgets",
  recurrences: "recurrences",
  forecasts: "forecast_items",
  documents: "documents",
  documentAssociations: "document_transaction_associations",
} as const;
