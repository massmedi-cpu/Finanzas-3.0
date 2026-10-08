import AccountsClient from "./accounts-client";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ accountId?: string | string[] }> }) {
  const params = await searchParams;
  const accountId = typeof params.accountId === "string" && UUID.test(params.accountId) ? params.accountId : null;
  return <AccountsClient initialAccountId={accountId} />;
}
