// Entirely synthetic Drive inventory cases. No real documents, banking data,
// credentials or original files may be committed into these tests.
import assert from "node:assert/strict";
import {
  DocumentDriveInventoryError,
  loadDocumentDriveInventory,
} from "../src/application/document-drive-inventory.ts";

const row = (id) => ({
  sourceDriveFileId: id, sourceModifiedAt: "2026-01-01T00:00:00.000Z",
  mimeType: "application/pdf", sizeBytes: 120,
});

const first = [row("drive-a"), row("drive-b")];
const second = [row("drive-c")];
const requested = [];
const complete = await loadDocumentDriveInventory(async (offset, limit) => {
  requested.push([offset, limit]);
  return offset === 0 ? { total: 3, items: first } : { total: 3, items: second };
}, 2);
assert.deepEqual(requested, [[0, 2], [2, 2]], "pagination must advance through every page");
assert.deepEqual([...complete.keys()], ["drive-a", "drive-b", "drive-c"]);
console.log("PASS · multi-page private inventory is complete and read-only");

const cases = [
  {
    name: "empty page despite undisclosed remaining originals",
    read: async (offset) => offset === 0
      ? { total: 3, items: first }
      : { total: 3, items: [] },
  },
  {
    name: "total changed during pagination",
    read: async (offset) => offset === 0
      ? { total: 3, items: first }
      : { total: 4, items: second },
  },
  {
    name: "duplicate Drive ID in another page",
    read: async (offset) => offset === 0
      ? { total: 3, items: first }
      : { total: 3, items: [row("drive-a")] },
  },
  {
    name: "malformed document payload despite HTTP success",
    read: async () => ({ total: 1, items: [{ sourceDriveFileId: "drive-a" }] }),
  },
  {
    name: "page larger than requested capacity",
    read: async () => ({ total: 3, items: [...first, ...second] }),
  },
  {
    name: "page reports fewer total originals than returned",
    read: async () => ({ total: 1, items: first }),
  },
];
for (const { name, read } of cases) {
  await assert.rejects(
    () => loadDocumentDriveInventory(read, 2),
    (error) => error instanceof DocumentDriveInventoryError,
    name,
  );
  console.log("PASS · rejected " + name);
}

const empty = await loadDocumentDriveInventory(async () => ({ total: 0, items: [] }), 2);
assert.equal(empty.size, 0, "confirmed empty inventory must remain empty");
console.log("PASS · genuinely empty inventory stays valid");
console.log("Drive inventory pagination and duplicate safety: 8/8 synthetic cases PASS");
