import { NextResponse } from "next/server";
import { runFoundationHealthChecks } from "../../../../src/core/foundation-health";

export const dynamic = "force-dynamic";

export function GET() {
  const health = runFoundationHealthChecks();

  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 500,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
