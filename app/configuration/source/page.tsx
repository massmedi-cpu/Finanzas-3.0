import AppShell from "../../app-shell";
import SourceOverviewClient from "./source-overview-client";

export const dynamic = "force-dynamic";

export default function SourcePage() {
  return (
    <AppShell>
      <SourceOverviewClient />
    </AppShell>
  );
}
