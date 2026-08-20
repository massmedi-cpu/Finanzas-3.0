export interface Account {
  id: string;
  name: string;
  institution?: string;
  balance: number;
}

export interface TransactionOrigin {
  id: string;
  sourceId: string;
  date: string;
  amount: number;
  accountId: string;
  description: string;
}

export interface TransactionEnriched extends TransactionOrigin {
  category?: string;
  notes?: string;
  reviewed: boolean;
}
