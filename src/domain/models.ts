export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'cash'
  | 'investment'
  | 'loan';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution?: string;
  balance: number;
  reconciledBalance?: number;
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export type TransactionStatus = 'confirmed' | 'pending' | 'review';

export interface TransactionOrigin {
  id: string;
  sourceId: string;
  date: string;
  valueDate?: string;
  amount: number;
  accountId: string;
  description: string;
}

export interface TransactionEnriched extends TransactionOrigin {
  type: TransactionType;
  category?: string;
  subcategory?: string;
  notes?: string;
  tags?: string[];
  status: TransactionStatus;
  reviewed: boolean;
}

export interface Budget {
  id: string;
  category: string;
  monthlyLimit: number;
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
}

export interface ForecastEvent {
  id: string;
  description: string;
  expectedDate: string;
  amount: number;
}
