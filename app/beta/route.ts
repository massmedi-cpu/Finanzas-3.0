import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CR006_BETA_BRANCH = "commercial-readiness/cr006-zero-cost-beta";
const CR006_BETA_COOKIE = "financial_app_cr006_beta";

function betaPreviewIsAvailable() {
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === CR006_BETA_BRANCH
  );
}

export async function GET(request: NextRequest) {
  if (!betaPreviewIsAvailable()) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }

  const destination = request.nextUrl.clone();
  destination.pathname = "/";
  destination.search = request.nextUrl.searchParams.get("reset") === "1"
    ? "?cr006_beta_reset=1"
    : "";

  const response = NextResponse.redirect(destination);
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-robots-tag", "noindex");
  response.cookies.set(CR006_BETA_COOKIE, "1", {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 23 * 60 * 60,
  });
  return response;
}
