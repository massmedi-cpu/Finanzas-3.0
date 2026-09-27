type Financial = {
  period: {
    dateFrom: string | null;
    dateTo: string | null;
    incomeCents: number;
    expenseCents: number;
    operatingNetCents: number;
  };
  balances: {
    asOfDate: string | null;
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

type Budget = {
  month: string;
  total: { actualExpenseCents: number };
};

type Forecast = {
  period: { dateFrom: string };
  summary: { openingBalanceCents: number };
};

export type HomeConsistency = {
  balancesMatch: boolean;
  currentMonthMatches: boolean;
  budgetMonthMatches: boolean;
  budgetActualMatches: boolean;
  forecastOpeningBalanceMatches: boolean;
};

// These checks compare already calculated values. Inicio never computes a
// replacement balance, period total, budget actual or forecast opening balance
// when two canonical sources disagree.
export function checkHomeConsistency(input: {
  financial: Financial | null;
  monthly: Monthly | null;
  budget: Budget | null;
  forecast: Forecast | null;
  today: string;
}): HomeConsistency {
  const { financial, monthly, budget, forecast, today } = input;
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

  const budgetMonthMatches = budget === null || budget.month === currentMonth;
  let budgetActualMatches = true;
  if (financial && budget && budgetMonthMatches
    && financial.period.dateFrom === `${currentMonth}-01`
    && financial.period.dateTo === today) {
    budgetActualMatches = Number.isSafeInteger(financial.period.expenseCents)
      && Number.isSafeInteger(budget.total.actualExpenseCents)
      && financial.period.expenseCents === budget.total.actualExpenseCents;
  }

  let forecastOpeningBalanceMatches = true;
  if (financial && forecast && forecast.period.dateFrom === today
    && financial.balances.asOfDate === today) {
    forecastOpeningBalanceMatches = Number.isSafeInteger(financial.balances.activeBalanceCents)
      && Number.isSafeInteger(forecast.summary.openingBalanceCents)
      && financial.balances.activeBalanceCents === forecast.summary.openingBalanceCents;
  }

  return {
    balancesMatch,
    currentMonthMatches,
    budgetMonthMatches,
    budgetActualMatches,
    forecastOpeningBalanceMatches,
  };
}
