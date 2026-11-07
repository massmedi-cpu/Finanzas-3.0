import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const discovery = await readFile("src/infrastructure/google/google-drive-document-discovery.ts", "utf8");
const route = await readFile("app/api/documents/drive-sync/route.ts", "utf8");
const inventory = await readFile("src/application/document-drive-inventory.ts", "utf8");
const inventoryTest = await readFile("scripts/test-document-drive-inventory.mjs", "utf8");
const client = await readFile("app/documents/drive-auto-sync.tsx", "utf8");
const page = await readFile("app/documents/page.tsx", "utf8");

assert.match(discovery, /FINANCIAL_APP_DOCUMENTS_DRIVE_FOLDER_ID/);
assert.match(discovery, /trashed = false/);
assert.match(discovery, /includeItemsFromAllDrives/);
assert.match(discovery, /application\/pdf/);
assert.match(discovery, /image\/jpeg/);
assert.match(discovery, /image\/png/);
assert.match(discovery, /image\/webp/);

assert.match(route, /GOOGLE_DOCUMENT_READONLY_SCOPES/);
assert.match(route, /existingDriveDocuments\(\)/);
assert.match(route, /loadDocumentDriveInventory/);
assert.match(route, /DocumentDriveInventoryError/);
assert.match(inventory, /sourceDriveFileId/);
assert.match(inventory, /sourceModifiedAt/);
assert.match(inventory, /expectedTotal/);
assert.match(inventory, /DocumentDriveInventoryError/);
assert.match(inventory, /itemsByDriveId\.has/);
assert.match(inventoryTest, /multi-page private inventory is complete/);
assert.match(inventoryTest, /duplicate Drive ID in another page/);
assert.match(route, /detectedChanges/);
assert.match(route, /automatic_incremental_read_only/);
assert.match(route, /duplicateSafe:\s*true/);
assert.match(route, /driveSource:\s*"read_only"/);
assert.match(route, /document\.drive_batch/);
assert.match(route, /process\.env\.VERCEL_ENV === "preview"/);
assert.match(route, /preview_drive_sync_read_only/);
assert.match(route, /gateway_identity_unavailable/);

assert.match(client, /useEffect/);
assert.match(client, /\/api\/documents\/drive-sync/);
assert.match(client, /sessionStorage/);
assert.match(client, /validDriveSyncResult/);
assert.match(client, /La sincronización no está completa/);
assert.match(client, /No se ha podido verificar Drive/);
assert.match(client, /preview_drive_sync_read_only/);
assert.match(client, /Solo en producción/);
assert.match(client, /Comprobar ahora/);
assert.match(page, /<DriveAutoSync \/>/);
assert.match(page, /<DocumentsClient\s+initialStatusFilter=/);
assert.match(page, /initialUnassociatedFilter=\{initialUnassociatedFilter\}/);

console.log("Axioma §51 · detección automática de documentos Drive: contrato 10.0.72 verificado.");
