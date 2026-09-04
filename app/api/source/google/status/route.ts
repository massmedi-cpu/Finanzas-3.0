import { GoogleOauthGateway } from "../../../../../src/infrastructure/google/google-oauth-gateway";
import { googleSourceServerConfigured } from "../../../../../src/infrastructure/google/google-source-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!googleSourceServerConfigured()) {
    return Response.json(
      { configured: false, connection: null },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }

  try {
    const connection = await new GoogleOauthGateway().status();
    return Response.json(
      {
        configured: true,
        connection: connection
          ? {
              connected: true,
              accountEmail: connection.account_email,
              sourceFileName: connection.source_file_name,
              connectedAt: connection.connected_at,
              lastVerifiedAt: connection.last_verified_at,
              readonly: true,
            }
          : null,
      },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch {
    return Response.json(
      { configured: true, connection: null, error: "google_status_unavailable" },
      { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }
}

export async function DELETE() {
  try {
    const result = await new GoogleOauthGateway().disconnect();
    return Response.json(
      { disconnected: result.disconnected },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch {
    return Response.json(
      { error: "google_disconnect_failed" },
      { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }
}
