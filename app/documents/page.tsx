import { DocumentsClient } from "./documents-client";
import { DriveAutoSync } from "./drive-auto-sync";

export default function DocumentsPage() {
  return (
    <>
      <DriveAutoSync />
      <DocumentsClient />
    </>
  );
}
