import { GoogleOauthGateway } from "../../../../../src/infrastructure/google/google-oauth-gateway";
import {
  GoogleSourceConnectionContractError,
  GoogleSourceRuntimeConfigurationError,
  getGoogleAllowedAccountEmail,
  getGoogleServiceAccountConfiguration,
  getGoogleSourceAuthMode,
  getGoogleSourceServerConfiguration,
  resolveGoogleSourceConnection,
  type GoogleSourceAuthMode,
} from "../../../../../src/infrastructure/google/google-source-runtime";

export const dynamic = "force-dynamic";

type ConfigurationStatus = {
  configured: boolean;
  missing: string[];
  authMode: GoogleSourceAuthMode;
};

async function configurationStatus(): Promise<ConfigurationStatus> {
  const missing = new Set<string>();
  const authMode = getGoogleSourceAuthMode();

  if (authMode === "service-account") {
    try {
      getGoogleServiceAccountConfiguration();
    } catch (error) {
      if (error instanceof GoogleSourceRuntimeConfigurationError) {
        for (const item of error.missing) missing.add(item);
      } else {
        throw error;
      }
    }
  } else {
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
  }

  return { configured: missing.size === 0, missing: [...missing], authMode };
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
      {
        configured: false,
        connection: null,
        authMode: configuration.authMode,
        ...previewDiagnostics,
      },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }

  try {
    const connection = await resolveGoogleSourceConnection();
    return Response.json(
      {
        configured: true,
        authMode: configuration.authMode,
        connection: connection
          ? {
              connected: true,
              accountEmail: connection.accountEmail,
              sourceFileName: connection.sourceFileName,
              connectedAt: connection.connectedAt,
              lastVerifiedAt: connection.lastVerifiedAt,
              readonly: connection.readonly,
              managed: connection.managed,
            }
          : null,
      },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch (error) {
    if (error instanceof GoogleSourceConnectionContractError) {
      return Response.json(
        { configured: true, connection: null, error: "google_connection_contract_mismatch" },
        { status: 409, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    return Response.json(
      { configured: true, connection: null, error: "google_status_unavailable" },
      { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }
}

export async function DELETE() {
  if (getGoogleSourceAuthMode() === "service-account") {
    return Response.json(
      { error: "google_service_account_managed" },
      { status: 409, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }

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
