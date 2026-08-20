export interface Account {
  id: string;
  name: string;
  entity?: string;
  balance: number;
}

export interface SourceMovement {
  id: string;
  sourceId: string;
  date: string;
  concept: string;
  amount: number;
  accountId: string;
}

export interface EnrichedMovement extends SourceMovement {
  category?: string;
  notes?: string;
  reviewed: boolean;
}
