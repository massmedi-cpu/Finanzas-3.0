import { DocumentsClient } from "./documents-client";
import { DriveAutoSync } from "./drive-auto-sync";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; unassociated?: string | string[] }> }) {
  const params = await searchParams;
  const initialStatusFilter = typeof params.status === "string" && ["imported", "pending_review", "confirmed", "archived"].includes(params.status) ? params.status : "";
  const initialUnassociatedFilter = params.unassociated === "true";
  return (
    <>
      <DriveAutoSync />
      <DocumentsClient initialStatusFilter={initialStatusFilter} initialUnassociatedFilter={initialUnassociatedFilter} />
    </>
  );
}
