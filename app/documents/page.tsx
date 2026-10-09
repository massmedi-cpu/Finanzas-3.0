import { DocumentsClient } from "./documents-client";
import { DriveAutoSync } from "./drive-auto-sync";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; unassociated?: string | string[]; scope?: string | string[]; offset?: string | string[] }> }) {
  const params = await searchParams;
  const initialStatusFilter = typeof params.status === "string" && ["imported", "pending_review", "confirmed", "archived"].includes(params.status) ? params.status : "";
  const initialUnassociatedFilter = params.unassociated === "true";
  const initialScope = params.scope === "tests" || params.scope === "all" ? params.scope : "ordinary";
  const offset = typeof params.offset === "string" ? Number(params.offset) : 0;
  const initialOffset = Number.isInteger(offset) && offset >= 0 && offset <= 100000 ? offset : 0;
  return (
    <>
      <DriveAutoSync />
      <DocumentsClient initialStatusFilter={initialStatusFilter} initialUnassociatedFilter={initialUnassociatedFilter} initialScope={initialScope} initialOffset={initialOffset} />
    </>
  );
}
