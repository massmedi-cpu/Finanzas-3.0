import { GoogleSourceRuntimeConfigurationError, createGoogleSourceRuntime } from "../../../../../src/infrastructure/google/google-source-runtime";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const runtime = createGoogleSourceRuntime();
    const connection = await runtime.oauth.status();
    if (!connection) {
      return Response.json(
        { error: "google_oauth_not_connected" },
        { status: 409, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    if (
      connection.source_file_id !== runtime.configuration.spreadsheetId ||
      connection.account_email.toLowerCase() !== runtime.configuration.allowedEmail
    ) {
      return Response.json(
        { error: "google_connection_contract_mismatch" },
        { status: 409, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }

    const snapshot = await runtime.reader.read();
    const result = await runtime.synchronization.synchronize(snapshot);
    await runtime.oauth.markVerified();

    return Response.json(
      {
        ...result,
        sourceRevision: snapshot.sourceRevision,
      },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch (error) {
    if (error instanceof GoogleSourceRuntimeConfigurationError) {
      return Response.json(
        { error: "google_oauth_not_configured", missing: error.missing },
        { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    console.error("google-source-sync", error instanceof Error ? error.name : "unknown_error");
    return Response.json(
      { error: "google_source_sync_failed" },
      { status: 500, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }
}
