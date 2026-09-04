import { NextResponse } from "next/server";
import { runCompleteFoundationHealthChecks } from "../../../../src/core/foundation-gate";

export const dynamic = "force-dynamic";

export function GET() {
  const health = runCompleteFoundationHealthChecks();

  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 500,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
