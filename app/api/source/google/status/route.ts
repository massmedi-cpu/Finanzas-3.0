import { GoogleOauthGateway } from "../../../../../src/infrastructure/google/google-oauth-gateway";
import {
  GoogleSourceRuntimeConfigurationError,
  getGoogleAllowedAccountEmail,
  getGoogleSourceServerConfiguration,
} from "../../../../../src/infrastructure/google/google-source-runtime";

export const dynamic = "force-dynamic";

type ConfigurationStatus = {
  configured: boolean;
  missing: string[];
};

async function configurationStatus(): Promise<ConfigurationStatus> {
  const missing = new Set<string>();

  try {
    getGoogleSourceServerConfiguration();
  } catch (error) {
    if (error instanceof GoogleSourceRuntimeConfigurationError) {
      for (const item of error.missing) missing.add(item);
    } else {
      throw error;
    }
  }

  try {
    await getGoogleAllowedAccountEmail();
  } catch (error) {
    if (error instanceof GoogleSourceRuntimeConfigurationError) {
      for (const item of error.missing) missing.add(item);
    } else {
      throw error;
    }
  }

  return { configured: missing.size === 0, missing: [...missing] };
}

export async function GET() {
  let configuration: ConfigurationStatus;
  try {
    configuration = await configurationStatus();
  } catch {
    return Response.json(
      { configured: false, connection: null, error: "google_status_unavailable" },
      { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }

  if (!configuration.configured) {
    const previewDiagnostics =
      process.env.VERCEL_ENV === "preview" ? { missing: configuration.missing } : {};
    return Response.json(
      { configured: false, connection: null, ...previewDiagnostics },
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
