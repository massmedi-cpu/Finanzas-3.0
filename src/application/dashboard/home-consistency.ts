type Financial = {
  period: {
    dateFrom: string | null;
    dateTo: string | null;
    incomeCents: number;
    expenseCents: number;
    operatingNetCents: number;
  };
  balances: {
    activeBalanceCents: number;
    accounts: Array<{ lifecycle: "active" | "archived"; balanceCents: number }>;
  };
};

type Monthly = {
  dateTo: string | null;
  rows: Array<{
    monthStart: string;
    incomeCents: number;
    expenseCents: number;
    operatingNetCents: number;
  }>;
};

export type HomeConsistency = {
  balancesMatch: boolean;
  currentMonthMatches: boolean;
  budgetMonthMatches: boolean;
};

// These checks compare already calculated values. Inicio never computes a
// replacement balance, period total or budget when two sources disagree.
export function checkHomeConsistency(input: {
  financial: Financial | null;
  monthly: Monthly | null;
  budgetMonth: string | null;
  today: string;
}): HomeConsistency {
  const { financial, monthly, budgetMonth, today } = input;
  const currentMonth = today.slice(0, 7);
  let balancesMatch = true;
  if (financial) {
    const accounts = financial.balances.accounts.filter((account) => account.lifecycle === "active");
    balancesMatch = Number.isSafeInteger(financial.balances.activeBalanceCents)
      && accounts.every((account) => Number.isSafeInteger(account.balanceCents))
      && accounts.reduce((sum, account) => sum + BigInt(account.balanceCents), BigInt(0))
        === BigInt(financial.balances.activeBalanceCents);
  }

  let currentMonthMatches = true;
  // Compare only identical periods. The two operations may be read at
  // different instants, particularly after a fallback or around midnight.
  if (financial && monthly && financial.period.dateFrom === `${currentMonth}-01`
    && financial.period.dateTo === monthly.dateTo) {
    const currentRows = monthly.rows.filter((row) => row.monthStart === `${currentMonth}-01`);
    currentMonthMatches = currentRows.length === 1
      && (["incomeCents", "expenseCents", "operatingNetCents"] as const).every((key) => (
        Number.isSafeInteger(financial.period[key])
        && Number.isSafeInteger(currentRows[0][key])
        && financial.period[key] === currentRows[0][key]
      ));
  }

  return {
    balancesMatch,
    currentMonthMatches,
    budgetMonthMatches: budgetMonth === null || budgetMonth === currentMonth,
  };
}
