import { DocumentsClient } from "./documents-client";
import { notFound } from "next/navigation";
import { isDocumentsDeferred } from "../../src/application/release-document-scope";
import { DriveAutoSync } from "./drive-auto-sync";
import { isDocumentDriveSyncDeferred } from "../../src/application/release-ocr-scope";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; unassociated?: string | string[]; scope?: string | string[]; offset?: string | string[] }> }) {
  if (isDocumentsDeferred()) notFound();
  const params = await searchParams;
  const initialStatusFilter = typeof params.status === "string" && ["imported", "pending_review", "confirmed", "archived"].includes(params.status) ? params.status : "";
  const initialUnassociatedFilter = params.unassociated === "true";
  const initialScope = params.scope === "tests" || params.scope === "all" ? params.scope : "ordinary";
  const offset = typeof params.offset === "string" ? Number(params.offset) : 0;
  const initialOffset = Number.isInteger(offset) && offset >= 0 && offset <= 100000 ? offset : 0;
  return (
    <>
      {!isDocumentDriveSyncDeferred() && <DriveAutoSync />}
      <DocumentsClient initialStatusFilter={initialStatusFilter} initialUnassociatedFilter={initialUnassociatedFilter} initialScope={initialScope} initialOffset={initialOffset} />
    </>
  );
}
