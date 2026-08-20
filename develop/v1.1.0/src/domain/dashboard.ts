export interface DashboardSummary {
  totalAssets: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavings: number;
}

export interface DashboardAlert {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning';
}
