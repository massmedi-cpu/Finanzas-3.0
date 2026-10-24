import { NextResponse } from "next/server";
import { getBuildInfo } from "../../../src/core/build-info";
import { isDocumentsDeferred } from "../../../src/application/release-document-scope";
import { isDocumentOcrDeferred, isDocumentDriveSyncDeferred } from "../../../src/application/release-ocr-scope";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ...getBuildInfo(),
    releaseFeatures: {
      documents: !isDocumentsDeferred(),
      documentOcr: !isDocumentOcrDeferred(),
      documentDriveSync: !isDocumentDriveSyncDeferred(),
    },
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
