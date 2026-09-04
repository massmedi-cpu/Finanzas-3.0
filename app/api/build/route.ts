import { NextResponse } from "next/server";
import { getBuildInfo } from "../../../src/core/build-info";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getBuildInfo(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
