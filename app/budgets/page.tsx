import BudgetsClient from "./budgets-client";

type BudgetSearchParams = {
  month?: string | string[];
};

function requestedMonth(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(candidate)
    ? candidate
    : undefined;
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<BudgetSearchParams>;
}) {
  const params = await searchParams;
  return <BudgetsClient initialMonth={requestedMonth(params.month)} />;
}
