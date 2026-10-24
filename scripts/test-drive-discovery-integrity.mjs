import assert from "node:assert/strict";
import {
  GoogleDriveDocumentDiscovery,
  GoogleDriveDocumentDiscoveryError,
} from "../src/infrastructure/google/google-drive-document-discovery.ts";

const file = (id) => ({
  id, name: "Factura de prueba.pdf", mimeType: "application/pdf",
  size: "123", modifiedTime: "2026-10-12T09:00:00.000Z", trashed: false,
});
const a = file("syntheticFileA1234");
const b = file("syntheticFileB5678");

function reader(responses) {
  let calls = 0;
  const fetcher = async (url, request) => {
    assert.equal(request.method, "GET");
    assert.match(String(url), /www\.googleapis\.com\/drive\/v3\/files\?/);
    assert.equal(request.headers.authorization, "Bearer synthetic-readonly");
    const result = responses[calls];
    calls += 1;
    if (!result) throw new Error("unexpected_discovery_request");
    return Response.json(result);
  };
  return {
    discovery: new GoogleDriveDocumentDiscovery(
      { getAccessToken: async () => "synthetic-readonly" }, fetcher,
    ),
    calls: () => calls,
  };
}

async function invalid(name, pages) {
  const { discovery } = reader(pages);
  await assert.rejects(
    discovery.listAuthorizedFolder("syntheticFolder123"),
    (error) => error instanceof GoogleDriveDocumentDiscoveryError
      && error.code === "google_drive_document_discovery_response_invalid",
    name,
  );
  process.stdout.write("PASS DISCOVERY: rejected " + name + "\n");
}

{
  const { discovery, calls } = reader([
    { files: [a], nextPageToken: "p2" },
    { files: [b] },
  ]);
  const result = await discovery.listAuthorizedFolder("syntheticFolder123");
  assert.deepEqual(result.files.map(row => row.fileId), [a.id, b.id]);
  assert.equal(result.truncated, false);
  assert.equal(calls(), 2);
  process.stdout.write("PASS DISCOVERY: two-page verified inventory\n");
}
await invalid("missing files property masquerading as empty inventory", [{}]);
await invalid("malformed cursor truncating inventory", [{ files: [a], nextPageToken: { bad: true } }]);
await invalid("repeated current cursor", [
  { files: [a], nextPageToken: "p2" },
  { files: [b], nextPageToken: "p2" },
]);
await invalid("nonadjacent repeated cursor", [
  { files: [], nextPageToken: "p2" },
  { files: [], nextPageToken: "p3" },
  { files: [], nextPageToken: "p2" },
]);
await invalid("duplicate file ID between pages", [
  { files: [a], nextPageToken: "p2" },
  { files: [a] },
]);
{
  const { discovery } = reader([{ files: [
    a, file("../invalid"), { ...b, modifiedTime: "yesterday" },
  ] }]);
  const result = await discovery.listAuthorizedFolder("syntheticFolder123");
  assert.equal(result.files.length, 1);
  assert.equal(result.skippedInvalid, 2);
  process.stdout.write("PASS DISCOVERY: bad file IDs and ambiguous dates are omitted\n");
}
{
  const { discovery } = reader([{ files: [] }]);
  const result = await discovery.listAuthorizedFolder("syntheticFolder123");
  assert.deepEqual(result.files, []);
  assert.equal(result.truncated, false);
  process.stdout.write("PASS DISCOVERY: genuinely empty authoritative folder\n");
}
