import AppShell from "../app-shell";
import { DocumentsClient } from "./documents-client";

export default function DocumentsPage() {
  return (
    <AppShell>
      <DocumentsClient />
    </AppShell>
  );
}
