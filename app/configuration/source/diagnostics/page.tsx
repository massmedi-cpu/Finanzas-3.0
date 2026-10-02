import AppShell from "../../../app-shell";
import SourceClient from "../source-client";

export const dynamic = "force-dynamic";

export default function SourceDiagnosticsPage() {
  return (
    <AppShell>
      <SourceClient />
    </AppShell>
  );
}
